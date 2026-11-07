import { getCurrentUser } from "@/src/lib/auth/auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { message: "Unauthorized" },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  return NextResponse.json(
    { user },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
