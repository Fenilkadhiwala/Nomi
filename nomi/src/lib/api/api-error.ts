import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "EMAIL_ALREADY_EXISTS"
  | "INVALID_CREDENTIALS"
  | "RATE_LIMITED"
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED"
  | "INTERNAL_ERROR"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ALREADY_MEMBER"
  | "INVITATION_EXISTS"
  | "EMAIL_DELIVERY_FAILED"
  | "HOME_CIRCLE_NOT_FOUND"
  | "INVALID_INVITATION"
  | "INVITATION_NOT_FOUND"
  | "INVITATION_UNAVAILABLE"
  | "INVITATION_EXPIRED"
  | "EMAIL_MISMATCH"
  | "INVITATION_TARGETS_MISSING"
  | "INVALID_INVITATION_TARGET"
  | "INVALID_HOME_CIRCLE";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  console.error("Unexpected API error:", error);

  return NextResponse.json(
    {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again later.",
      },
    },
    { status: 500 },
  );
}
