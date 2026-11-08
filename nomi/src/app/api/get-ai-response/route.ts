import { NextRequest, NextResponse } from "next/server";

import { getChatResponse } from "@/src/services/chat.service";
import { pool } from "@/src/lib/db/pool";
import { getCurrentUser } from "@/src/lib/auth/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse request
    const body = await req.json();

    const { message, threadId } = body;

    if (
      typeof message !== "string" ||
      !message.trim() ||
      typeof threadId !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid message or thread ID" },
        { status: 400 },
      );
    }

    // 3. Extract group ID from thread ID
    const match = /^group_([1-9]\d*)$/.exec(threadId);

    if (!match) {
      return NextResponse.json(
        { error: "Invalid group conversation ID" },
        { status: 400 },
      );
    }

    const groupId = Number(match[1]);

    if (!Number.isSafeInteger(groupId)) {
      return NextResponse.json({ error: "Invalid group ID" }, { status: 400 });
    }

    // 4. Verify membership in both group and household
    const membership = await pool.query(
      `
        SELECT 1
        FROM public.household_groups g
        INNER JOIN public.household_group_members gm
          ON gm.group_id = g.id
        INNER JOIN public.household_members hm
          ON hm.household_id = g.household_id
          AND hm.user_id = gm.user_id
        WHERE g.id = $1
          AND gm.user_id = $2
        LIMIT 1
      `,
      [groupId, user.id],
    );

    if (membership.rowCount === 0) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // 5. Use authenticated sender ID
    const senderId = String(user.id);

    // 6. Run your existing chat service
    const result = await getChatResponse(message.trim(), senderId, threadId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("AI response error:", error);

    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 },
    );
  }
}
