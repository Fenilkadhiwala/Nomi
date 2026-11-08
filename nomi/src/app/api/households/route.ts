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

const DEFAULT_HOUSEHOLD_NAME = "My Household";
const DEFAULT_GROUP_NAME = "Home Circle";

// Validate the household creation request
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

export async function POST(request: NextRequest) {
  // Verify request origin
  if (!verifyRequestOrigin(request)) {
    return forbiddenOriginResponse();
  }

  let client: PoolClient | undefined;
  let transactionStarted = false;

  try {
    // 1. Authenticate user
    const user = await getCurrentUser();

    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Please sign in to continue.");
    }

    // 2. Parse request body
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid request body.");
    }

    // 3. Validate request data
    const parsed = createHouseholdSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];

      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        firstIssue?.message ??
          "Please provide valid household address details.",
      );
    }

    const { address_line_1, address_line_2, city, state, zip_code, country } =
      parsed.data;

    // 4. Acquire database connection
    client = await pool.connect();

    // 5. Begin transaction
    await client.query("BEGIN");
    transactionStarted = true;

    // 6. Create household
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
        DEFAULT_HOUSEHOLD_NAME,
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

    // 7. Add creator as household owner
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

    // 8. Create default group
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
      [household.id, DEFAULT_GROUP_NAME, user.id],
    );

    const defaultGroup = groupResult.rows[0];

    if (!defaultGroup) {
      throw new Error("Failed to create default group.");
    }

    // 9. Add creator as default group owner
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

    // 10. Commit all changes
    await client.query("COMMIT");
    transactionStarted = false;

    // 11. Return created household and group
    return NextResponse.json(
      {
        household,
        defaultGroup,
        role: "owner",
        message: "Household and default group created successfully.",
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    // Roll back the entire transaction on failure
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
