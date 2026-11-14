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
  | "INVALID_HOME_CIRCLE"
  | "HOUSEHOLD_ALREADY_EXISTS"
  | "MAIN_GROUP_NOT_FOUND"
  | "HOUSEHOLD_NOT_FOUND"
  | "INVALID_MAIN_GROUP"
  | "INVALID_GROUP_MEMBERS"
  | "NEW_OWNER_REQUIRED"
  | "LAST_OWNER"
  | "INVALID_HOUSEHOLD"
  | "GROUP_CHANGED"
  | "MEMBERSHIP_MISMATCH"
  | "LAST_HOUSEHOLD_OWNER"
  | "USE_INVITATION"
  | "USER_NOT_FOUND"
  | "INVITATION_PERMISSIONS_CHANGED";

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
