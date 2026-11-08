import { NextRequest, NextResponse } from "next/server";

import { pool } from "@/src/lib/db/pool";
import { ApiError, handleApiError } from "@/src/lib/api/api-error";
import { getCurrentUser } from "@/src/lib/auth/auth";

export const runtime = "nodejs";

interface GroupMember {
  user_id: number;
  name: string;
  email: string;
  role: "owner" | "admin" | "member";
  joined_at: Date;
}

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{ groupId: string }>;
  },
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Please sign in to continue.");
    }

    const { groupId } = await context.params;
    const parsedId = Number(groupId);

    if (!Number.isSafeInteger(parsedId) || parsedId <= 0) {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid group ID.");
    }

    // Confirm the requester is a member of this group and household
    const accessResult = await pool.query(
      `
        SELECT 1
        FROM public.household_groups g
        INNER JOIN public.household_group_members gm
          ON gm.group_id = g.id
        INNER JOIN public.household_members hm
          ON hm.household_id = g.household_id
         AND hm.user_id = gm.user_id
        WHERE g.id = $1
          AND gm.user_id = $2
        LIMIT 1
      `,
      [parsedId, user.id],
    );

    if (accessResult.rowCount === 0) {
      throw new ApiError(404, "NOT_FOUND", "Group not found.");
    }

    const result = await pool.query<GroupMember>(
      `
        SELECT
          gm.user_id,
          u.name,
          u.email,
          gm.role,
          gm.joined_at
        FROM public.household_group_members gm
        INNER JOIN public.users u
          ON u.id = gm.user_id
        WHERE gm.group_id = $1
        ORDER BY
          CASE gm.role
            WHEN 'owner' THEN 0
            WHEN 'admin' THEN 1
            ELSE 2
          END,
          gm.joined_at ASC,
          gm.user_id ASC
      `,
      [parsedId],
    );

    return NextResponse.json(
      {
        group_id: parsedId,
        members: result.rows,
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
