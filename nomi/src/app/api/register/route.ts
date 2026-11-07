import { ApiError, handleApiError } from "@/src/lib/api/api-error";

import {
  COOKIE_NAME,
  createSession,
  hashPassword,
  sessionCookieOptions,
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

const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(100),

    email: z
      .email()
      .max(255)
      .transform((value) => value.toLowerCase()),

    password: z.string().min(8).max(128),
  })
  .strict();

type PostgresError = Error & {
  code?: string;
  constraint?: string;
};

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

    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Please check your registration details.",
      );
    }

    const { name, email, password } = parsed.data;

    const allowed = await checkAuthRateLimit(`register:${email}`, 5, 60);

    if (!allowed) {
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Too many registration attempts. Please try again later.",
      );
    }

    // Optional early duplicate check.
    // The database unique constraint remains authoritative.
    const existingUser = await pool.query(
      `SELECT id
       FROM public.users
       WHERE LOWER(email) = $1
       LIMIT 1`,
      [email],
    );

    if (existingUser.rowCount) {
      throw new ApiError(
        409,
        "EMAIL_ALREADY_EXISTS",
        "An account with this email already exists. Please sign in.",
      );
    }

    const passwordHash = await hashPassword(password);

    const result = await pool.query<AuthUser>(
      `INSERT INTO public.users
         (name, email, password_hash, auth_provider)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email`,
      [name, email, passwordHash, "credentials"],
    );

    const user = result.rows[0];

    const token = await createSession(user.id);

    const response = NextResponse.json(
      {
        success: true,
        user,
        message: "Account created successfully.",
      },
      { status: 201 },
    );

    response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());

    return response;
  } catch (error: unknown) {
    const dbError = error as PostgresError;

    if (
      dbError.code === "23505" &&
      dbError.constraint === "users_email_unique"
    ) {
      return handleApiError(
        new ApiError(
          409,
          "EMAIL_ALREADY_EXISTS",
          "An account with this email already exists. Please sign in.",
        ),
      );
    }

    return handleApiError(error);
  }
}
