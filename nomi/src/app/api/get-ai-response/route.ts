import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getChatResponse } from "@/src/services/chat.service";
import { pool } from "@/src/lib/db/pool";
import { getCurrentUser } from "@/src/lib/auth/auth";

import {
  forbiddenOriginResponse,
  verifyRequestOrigin,
} from "@/src/lib/auth/auth-request";

export const runtime = "nodejs";

const chatRequestSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(1, "Message cannot be empty.")
      .max(10000, "Message is too long."),

    threadId: z
      .string()
      .regex(/^group_([1-9]\d*)$/, "Invalid group conversation ID."),
  })
  .strict();

export async function POST(req: NextRequest) {
  // 1. Verify request origin.
  if (!verifyRequestOrigin(req)) {
    return forbiddenOriginResponse();
  }

  try {
    // 2. Authenticate user.
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 3. Parse request body.
    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 },
      );
    }

    // 4. Validate request.
    const parsed = chatRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ?? "Invalid message or thread ID.",
        },
        { status: 400 },
      );
    }

    const { message, threadId } = parsed.data;

    // 5. Extract group ID.
    const match = /^group_([1-9]\d*)$/.exec(threadId);

    if (!match) {
      return NextResponse.json(
        { error: "Invalid group conversation ID." },
        { status: 400 },
      );
    }

    const groupId = Number(match[1]);

    if (!Number.isSafeInteger(groupId)) {
      return NextResponse.json({ error: "Invalid group ID." }, { status: 400 });
    }

    // 6. Verify direct group membership.
    //
    // IMPORTANT:
    // We intentionally do NOT join household_members.
    //
    // This allows:
    // - Main Household group members
    // - Private-group members who left Main Household
    // - Detached private groups (household_id = NULL)
    // - Private groups with members from other households
    //
    // Membership in the requested group is mandatory.
    const membership = await pool.query(
      `
        SELECT 1
        FROM public.household_groups g
        INNER JOIN public.household_group_members gm
          ON gm.group_id = g.id
        WHERE g.id = $1
          AND gm.user_id = $2
        LIMIT 1
      `,
      [groupId, user.id],
    );

    if (membership.rowCount === 0) {
      return NextResponse.json({ error: "Group not found." }, { status: 404 });
    }

    // 7. Always use the authenticated user ID.
    //
    // Never trust a sender ID from the request body.
    const senderId = String(user.id);

    // 8. Run the existing Nomi chat service.
    const result = await getChatResponse(message, senderId, threadId);

    // 9. Return response.
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("AI response error:", error);

    return NextResponse.json(
      { error: "Failed to generate response." },
      { status: 500 },
    );
  }
}
