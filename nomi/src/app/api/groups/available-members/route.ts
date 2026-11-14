import { NextResponse } from "next/server";

import { pool } from "@/src/lib/db/pool";
import { ApiError, handleApiError } from "@/src/lib/api/api-error";
import { getCurrentUser } from "@/src/lib/auth/auth";

export const runtime = "nodejs";

interface AvailableMemberRow {
  id: number;
  name: string;
  email: string;
  main_household_member: boolean;
}

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Please sign in to continue.");
    }

    const result = await pool.query<AvailableMemberRow>(
      `
        WITH my_main_household AS (
          SELECT g.household_id
          FROM public.household_groups g
          INNER JOIN public.household_group_members gm
            ON gm.group_id = g.id
          WHERE gm.user_id = $1
            AND g.is_default = TRUE
            AND g.household_id IS NOT NULL
          ORDER BY g.id ASC
          LIMIT 1
        )
        SELECT DISTINCT
          u.id,
          u.name,
          u.email,
          EXISTS (
            SELECT 1
            FROM public.household_members hm
            WHERE hm.user_id = u.id
              AND hm.household_id = (
                SELECT household_id
                FROM my_main_household
              )
          ) AS main_household_member
        FROM public.users u
        INNER JOIN public.household_group_members gm
          ON gm.user_id = u.id
        WHERE gm.group_id IN (
          SELECT my_groups.group_id
          FROM public.household_group_members my_groups
          WHERE my_groups.user_id = $1
        )
          AND u.id <> $1
        ORDER BY u.name ASC, u.id ASC
      `,
      [user.id],
    );

    return NextResponse.json(
      {
        members: result.rows,
      },
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
