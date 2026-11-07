import "server-only";

import { NextRequest, NextResponse } from "next/server";

export function verifyRequestOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");

  const expectedOrigin = process.env.APP_ORIGIN;

  if (!origin || !expectedOrigin) {
    return false;
  }

  try {
    return new URL(origin).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}

export function forbiddenOriginResponse() {
  return NextResponse.json(
    { message: "Invalid request origin" },
    { status: 403 },
  );
}
