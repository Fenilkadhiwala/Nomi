import { ApiError, handleApiError } from "@/src/lib/api/api-error";

import {
  COOKIE_NAME,
  createSession,
  sessionCookieOptions,
  verifyPassword,
} from "@/src/lib/auth/auth";

import { checkAuthRateLimit } from "@/src/lib/auth/auth-rate-limit";

import {
  forbiddenOriginResponse,
  verifyRequestOrigin,
} from "@/src/lib/auth/auth-request";

import { pool } from "@/src/lib/db/pool";
import { AuthUser } from "@/src/types/types";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const loginSchema = z
  .object({
    email: z
      .email()
      .max(255)
      .transform((value) => value.toLowerCase()),

    password: z.string().min(1).max(128),
  })
  .strict();

interface DatabaseUser extends AuthUser {
  password_hash: string | null;
}

export async function POST(request: NextRequest) {
  if (!verifyRequestOrigin(request)) {
    return forbiddenOriginResponse();
  }

  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid request body.");
    }

    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Please enter a valid email and password.",
      );
    }

    const { email, password } = parsed.data;

    const allowed = await checkAuthRateLimit(`login:${email}`, 5, 15);

    // if (!allowed) {
    //   throw new ApiError(
    //     429,
    //     "RATE_LIMITED",
    //     "Too many login attempts. Please try again later.",
    //   );
    // }

    const result = await pool.query<DatabaseUser>(
      `SELECT id, name, email, password_hash
       FROM public.users
       WHERE LOWER(email) = $1
       LIMIT 1`,
      [email],
    );

    const user = result.rows[0];

    if (!user?.password_hash) {
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "Incorrect email or password. Please try again.",
      );
    }

    const isPasswordValid = await verifyPassword(user.password_hash, password);

    if (!isPasswordValid) {
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "Incorrect email or password. Please try again.",
      );
    }

    const token = await createSession(user.id);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      message: "Signed in successfully.",
    });

    response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());

    return response;
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
