import { NextResponse } from "next/server";

import { pool } from "@/src/lib/db/pool";

import { ApiError, handleApiError } from "@/src/lib/api/api-error";
import { getCurrentUser } from "@/src/lib/auth/auth";

export const runtime = "nodejs";

interface UserHousehold {
  id: number;
  name: string;
  description: string | null;
  address: string | null;
  role: "owner" | "admin" | "member";
  created_at: string;
}

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Please sign in to continue.");
    }

    const userId = user.id;

    const result = await pool.query<UserHousehold>(
      `
        SELECT
          h.id,
          h.name,
          hm.role,
          h.created_at
        FROM public.households h
        INNER JOIN public.household_members hm
          ON hm.household_id = h.id
        WHERE hm.user_id = $1
        ORDER BY hm.created_at DESC, h.id DESC
      `,
      [userId],
    );

    return NextResponse.json({
      households: result.rows,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
