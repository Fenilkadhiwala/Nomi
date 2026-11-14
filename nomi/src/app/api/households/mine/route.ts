import { NextResponse } from "next/server";

import { pool } from "@/src/lib/db/pool";

import { ApiError, handleApiError } from "@/src/lib/api/api-error";
import { getCurrentUser } from "@/src/lib/auth/auth";

export const runtime = "nodejs";

interface UserHousehold {
  id: number;
  name: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  role: "owner" | "admin" | "member";
  created_at: Date;
  updated_at: Date;
}

export async function GET() {
  try {
    // 1. Authenticate user.
    const user = await getCurrentUser();

    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Please sign in to continue.");
    }

    // 2. Fetch only households where the user
    // has actual household membership.
    //
    // Membership in a private group does not
    // automatically grant household membership.
    const result = await pool.query<UserHousehold>(
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
          hm.role,
          h.created_at,
          h.updated_at
        FROM public.households h
        INNER JOIN public.household_members hm
          ON hm.household_id = h.id
        WHERE hm.user_id = $1
        ORDER BY hm.created_at DESC, h.id DESC
      `,
      [user.id],
    );

    // 3. Return household memberships.
    return NextResponse.json(
      {
        households: result.rows,
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
