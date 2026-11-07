import {
  COOKIE_NAME,
  getSession,
  sessionCookieOptions,
} from "@/src/lib/auth/auth";
import {
  forbiddenOriginResponse,
  verifyRequestOrigin,
} from "@/src/lib/auth/auth-request";
import { pool } from "@/src/lib/db/pool";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!verifyRequestOrigin(request)) {
    return forbiddenOriginResponse();
  }

  try {
    const session = await getSession();

    if (session) {
      await pool.query(
        `UPDATE user_sessions
         SET revoked_at = NOW()
         WHERE id = $1
           AND revoked_at IS NULL`,
        [session.sessionId],
      );
    }

    const response = NextResponse.json({
      message: "Logged out successfully",
    });

    response.cookies.set(COOKIE_NAME, "", {
      ...sessionCookieOptions(),
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error("Logout failed:", error);

    return NextResponse.json({ message: "Unable to log out" }, { status: 500 });
  }
}
