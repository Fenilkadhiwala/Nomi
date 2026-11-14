import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { PoolClient } from "pg";
import countries from "i18n-iso-countries";

import { pool } from "@/src/lib/db/pool";
import { ApiError, handleApiError } from "@/src/lib/api/api-error";
import {
  forbiddenOriginResponse,
  verifyRequestOrigin,
} from "@/src/lib/auth/auth-request";
import { getCurrentUser } from "@/src/lib/auth/auth";

export const runtime = "nodejs";

const createHouseholdSchema = z
  .object({
    address_line_1: z
      .string()
      .trim()
      .min(1, "Address line 1 is required")
      .max(255),

    address_line_2: z.string().trim().max(255).nullable().optional(),

    city: z.string().trim().min(1, "City is required").max(120),

    state: z.string().trim().min(1, "State or province is required").max(120),

    zip_code: z
      .string()
      .trim()
      .min(1, "ZIP or postal code is required")
      .max(20),

    country: z
      .string()
      .trim()
      .length(2, "Invalid country code")
      .regex(/^[A-Z]{2}$/, "Invalid country code")
      .refine(
        (code) => countries.isValid(code),
        "Please select a valid country",
      ),
  })
  .strict();

interface CreatedHousehold {
  id: number;
  name: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  created_at: Date;
  updated_at: Date;
}

interface CreatedGroup {
  id: number;
  household_id: number;
  name: string;
  is_default: boolean;
  created_by: number;
  created_at: Date;
  updated_at: Date;
}

interface MyHouseholdRow extends CreatedHousehold {
  role: "owner" | "admin" | "member";
}

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Please sign in to continue.");
    }

    const result = await pool.query<MyHouseholdRow>(
      `
        SELECT
          h.id,
          h.name,
          h.address_line_1,
          h.address_line_2,
          h.city,
          h.state,
          h.zip_code,
          h.country,
          h.created_at,
          h.updated_at,
          hm.role
        FROM public.households h
        INNER JOIN public.household_members hm
          ON hm.household_id = h.id
        WHERE hm.user_id = $1
        ORDER BY
          h.created_at ASC,
          h.id ASC
      `,
      [user.id],
    );

    return NextResponse.json(
      { households: result.rows },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!verifyRequestOrigin(request)) {
    return forbiddenOriginResponse();
  }

  let client: PoolClient | undefined;
  let transactionStarted = false;

  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Please sign in to continue.");
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid request body.");
    }

    const parsed = createHouseholdSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ??
          "Please provide valid household address details.",
      );
    }

    const { address_line_1, address_line_2, city, state, zip_code, country } =
      parsed.data;

    const householdName = address_line_1.trim();

    client = await pool.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    // Serialize household creation for this user.
    const userResult = await client.query<{
      id: number;
    }>(
      `
        SELECT id
        FROM public.users
        WHERE id = $1
        FOR UPDATE
      `,
      [user.id],
    );

    if (!userResult.rows[0]) {
      throw new ApiError(
        401,
        "UNAUTHORIZED",
        "Your account could not be found.",
      );
    }

    // Private-group memberships do not count.
    const existingMembership = await client.query(
      `
        SELECT 1
        FROM public.household_members
        WHERE user_id = $1
        LIMIT 1
      `,
      [user.id],
    );

    if (existingMembership.rowCount) {
      throw new ApiError(
        409,
        "HOUSEHOLD_ALREADY_EXISTS",
        "You already belong to a household.",
      );
    }

    const householdResult = await client.query<CreatedHousehold>(
      `
          INSERT INTO public.households (
            name,
            address_line_1,
            address_line_2,
            city,
            state,
            zip_code,
            country
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING
            id,
            name,
            address_line_1,
            address_line_2,
            city,
            state,
            zip_code,
            country,
            created_at,
            updated_at
        `,
      [
        householdName,
        address_line_1,
        address_line_2 || null,
        city,
        state,
        zip_code,
        country,
      ],
    );

    const household = householdResult.rows[0];

    if (!household) {
      throw new Error("Failed to create household.");
    }

    await client.query(
      `
        INSERT INTO public.household_members (
          household_id,
          user_id,
          role
        )
        VALUES ($1, $2, 'owner')
      `,
      [household.id, user.id],
    );

    const groupResult = await client.query<CreatedGroup>(
      `
          INSERT INTO public.household_groups (
            household_id,
            name,
            is_default,
            created_by
          )
          VALUES ($1, $2, TRUE, $3)
          RETURNING
            id,
            household_id,
            name,
            is_default,
            created_by,
            created_at,
            updated_at
        `,
      [household.id, householdName, user.id],
    );

    const defaultGroup = groupResult.rows[0];

    if (!defaultGroup) {
      throw new Error("Failed to create default group.");
    }

    await client.query(
      `
        INSERT INTO public.household_group_members (
          group_id,
          user_id,
          role
        )
        VALUES ($1, $2, 'owner')
      `,
      [defaultGroup.id, user.id],
    );

    // Set the newly created household as active
    // if a preferences row already exists.
    await client.query(
      `
        UPDATE public.user_preferences
        SET active_household_id = $2
        WHERE user_id = $1
      `,
      [user.id, household.id],
    );

    await client.query("COMMIT");
    transactionStarted = false;

    client.release();
    client = undefined;

    return NextResponse.json(
      {
        household,
        defaultGroup: {
          ...defaultGroup,
          role: "owner",
          member_count: 1,
        },
        role: "owner",
        message: "Your household has been created successfully.",
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Household transaction rollback failed:", rollbackError);
      }
    }

    return handleApiError(error);
  } finally {
    client?.release();
  }
}
