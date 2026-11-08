import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { PoolClient } from "pg";

import { pool } from "@/src/lib/db/pool";
import { ApiError, handleApiError } from "@/src/lib/api/api-error";
import { getCurrentUser } from "@/src/lib/auth/auth";

import {
  forbiddenOriginResponse,
  verifyRequestOrigin,
} from "@/src/lib/auth/auth-request";

export const runtime = "nodejs";

const createGroupSchema = z
  .object({
    household_id: z.number().int().positive(),
    name: z.string().trim().min(2).max(100),
  })
  .strict();

interface GroupRow {
  id: number;
  household_id: number;
  name: string;
  is_default: boolean;
  created_by: number;
  created_at: Date;
  updated_at: Date;
  role: "owner" | "admin" | "member";
  member_count: number;
}

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Please sign in to continue.");
    }

    // Authorization is based on group membership.
    //
    // This allows:
    // - Home Circle members
    // - Private-group-only members
    // - Users belonging to multiple groups
    //
    // A household_members record is NOT required
    // to access a private group.
    const result = await pool.query<GroupRow>(
      `
        SELECT
          g.id,
          g.household_id,
          g.name,
          g.is_default,
          g.created_by,
          g.created_at,
          g.updated_at,
          gm.role,
          (
            SELECT COUNT(*)::int
            FROM public.household_group_members members
            WHERE members.group_id = g.id
          ) AS member_count
        FROM public.household_groups g
        INNER JOIN public.household_group_members gm
          ON gm.group_id = g.id
        WHERE gm.user_id = $1
        ORDER BY
          g.is_default DESC,
          g.created_at ASC,
          g.id ASC
      `,
      [user.id],
    );

    return NextResponse.json(
      { groups: result.rows },
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

    const parsed = createGroupSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Invalid group details.",
      );
    }

    const { household_id, name } = parsed.data;

    client = await pool.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    // Only household owners/admins can create
    // additional private groups.
    //
    // Private-group-only membership does not grant
    // household administration privileges.
    const membershipResult = await client.query<{
      role: "owner" | "admin" | "member";
    }>(
      `
        SELECT role
        FROM public.household_members
        WHERE household_id = $1
          AND user_id = $2
        FOR UPDATE
      `,
      [household_id, user.id],
    );

    const membership = membershipResult.rows[0];

    if (!membership) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You do not have access to this household.",
      );
    }

    if (membership.role !== "owner" && membership.role !== "admin") {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Only household owners and admins can create groups.",
      );
    }

    // Create a private group.
    const groupResult = await client.query<{
      id: number;
      household_id: number;
      name: string;
      is_default: boolean;
      created_by: number;
      created_at: Date;
      updated_at: Date;
    }>(
      `
        INSERT INTO public.household_groups (
          household_id,
          name,
          is_default,
          created_by
        )
        VALUES ($1, $2, FALSE, $3)
        RETURNING
          id,
          household_id,
          name,
          is_default,
          created_by,
          created_at,
          updated_at
      `,
      [household_id, name, user.id],
    );

    const group = groupResult.rows[0];

    if (!group) {
      throw new Error("Failed to create group.");
    }

    // The creator automatically becomes
    // the owner of the new group.
    await client.query(
      `
        INSERT INTO public.household_group_members (
          group_id,
          user_id,
          role
        )
        VALUES ($1, $2, 'owner')
      `,
      [group.id, user.id],
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return NextResponse.json(
      {
        group: {
          ...group,
          role: "owner",
          member_count: 1,
        },
        message: "Group created successfully.",
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
        console.error("Group transaction rollback failed:", rollbackError);
      }
    }

    return handleApiError(error);
  } finally {
    client?.release();
  }
}
