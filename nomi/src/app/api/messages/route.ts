import { NextRequest, NextResponse } from "next/server";

import { pool } from "@/src/lib/db/pool";
import { getCurrentUser } from "@/src/lib/auth/auth";

import { ApiError, handleApiError } from "@/src/lib/api/api-error";

export const runtime = "nodejs";

interface MessageRow {
  id: number;
  sender_id: string;
  role: string;
  content: string;
  created_at: Date;
}

export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate user
    const user = await getCurrentUser();

    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Please sign in to continue.");
    }

    // 2. Read thread ID
    const threadId = request.nextUrl.searchParams.get("threadId");

    if (!threadId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Thread ID is required.");
    }

    // 3. Validate group thread format: group_123
    const match = /^group_([1-9]\d*)$/.exec(threadId);

    if (!match) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Invalid group conversation ID.",
      );
    }

    const groupId = Number(match[1]);

    if (!Number.isSafeInteger(groupId)) {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid group ID.");
    }

    // 4. Verify group and household membership
    const accessResult = await pool.query(
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

    if (accessResult.rowCount === 0) {
      throw new ApiError(404, "NOT_FOUND", "Group conversation not found.");
    }

    // 5. Fetch messages for authorized group
    const result = await pool.query<MessageRow>(
      `
        SELECT
          id,
          sender_id,
          role,
          content,
          created_at
        FROM public.messages
        WHERE thread_id = $1
        ORDER BY created_at ASC, id ASC
      `,
      [threadId],
    );

    // 6. Return messages
    return NextResponse.json(
      {
        threadId,
        messages: result.rows,
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
