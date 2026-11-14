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
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate user.
    const user = await getCurrentUser();

    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Please sign in to continue.");
    }

    // 2. Read and validate the group thread ID.
    const threadId = request.nextUrl.searchParams.get("threadId");

    if (!threadId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Thread ID is required.");
    }

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

    // 3. Verify the user belongs to this group.
    //
    // Private group membership is independent
    // of household membership.
    const accessResult = await pool.query(
      `
        SELECT 1
        FROM public.household_group_members gm
        INNER JOIN public.household_groups g
          ON g.id = gm.group_id
        WHERE gm.group_id = $1
          AND gm.user_id = $2
        LIMIT 1
      `,
      [groupId, user.id],
    );

    if (accessResult.rowCount === 0) {
      throw new ApiError(404, "NOT_FOUND", "Group conversation not found.");
    }

    // 4. Fetch messages, including persistent
    // system-event metadata.
    const result = await pool.query<MessageRow>(
      `
        SELECT
          id,
          sender_id,
          role,
          content,
          metadata,
          created_at
        FROM public.messages
        WHERE thread_id = $1
        ORDER BY created_at ASC, id ASC
      `,
      [threadId],
    );

    // 5. Return the authorized conversation.
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
