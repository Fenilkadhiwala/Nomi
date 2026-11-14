import { AIMessage } from "@langchain/core/messages";

import { getCompiledGraph } from "../lib/graph/graph";
import { pool } from "../lib/db/pool";
import { pusherServer } from "../lib/pusher/server";

interface MessageRow {
  id: number;
  thread_id: string;
  sender_id: string;
  role: string;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

function getGroupId(threadId: string): number {
  const match = /^group_([1-9]\d*)$/.exec(threadId);

  if (!match) {
    throw new Error("Invalid group conversation ID.");
  }

  const groupId = Number(match[1]);

  if (!Number.isSafeInteger(groupId)) {
    throw new Error("Invalid group ID.");
  }

  return groupId;
}

async function publishMessage(
  threadId: string,
  message: MessageRow,
): Promise<void> {
  try {
    await pusherServer.trigger(
      `private-household-${threadId}`,
      "new-message",
      message,
    );
  } catch (error) {
    // The message is already persisted.
    // A Pusher failure should not prevent the
    // chat workflow from continuing.
    console.error("Failed to publish chat message:", error);
  }
}

async function verifyGroupMembership(
  groupId: number,
  senderId: string,
): Promise<void> {
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
    [groupId, senderId],
  );

  if (membership.rowCount === 0) {
    throw new Error("You are not authorized to access this group.");
  }
}

export async function getChatResponse(
  message: string,
  senderId: string,
  threadId: string,
) {
  const text = message.trim();

  if (!text) {
    throw new Error("Message cannot be empty.");
  }

  // 1. Validate thread ID.
  const groupId = getGroupId(threadId);

  // 2. Verify direct group membership.
  //
  // No household membership is required.
  await verifyGroupMembership(groupId, senderId);

  // 3. Save user message.
  const userInsert = await pool.query<MessageRow>(
    `
      INSERT INTO public.messages (
        thread_id,
        sender_id,
        role,
        content
      )
      VALUES ($1, $2, 'user', $3)
      RETURNING
        id,
        thread_id,
        sender_id,
        role,
        content,
        metadata,
        created_at
    `,
    [threadId, senderId, text],
  );

  const userMessage = userInsert.rows[0];

  if (!userMessage) {
    throw new Error("Failed to save user message.");
  }

  // 4. Broadcast user message.
  await publishMessage(threadId, userMessage);

  // 5. Execute group-specific LangGraph thread.
  const graph = await getCompiledGraph();

  const config = {
    configurable: {
      thread_id: threadId,
    },
  };

  const result = await graph.invoke(
    {
      message: text,
      senderId,
    },
    config,
  );

  // 6. Normalize assistant response.
  const response =
    typeof result.lastResponse === "string" ? result.lastResponse.trim() : "";

  // 7. Only save and broadcast an assistant
  // response when the graph produced one.
  //
  // This preserves household-directed messages
  // that should not trigger a Nomi reply.
  if (response) {
    // Check membership again before publishing
    // the AI response. The user may have left
    // or been removed during graph execution.
    await verifyGroupMembership(groupId, senderId);

    // Preserve your existing LangGraph history.
    await graph.updateState(config, {
      conversationHistory: [new AIMessage(response)],
    });

    // 8. Save assistant response.
    const aiInsert = await pool.query<MessageRow>(
      `
        INSERT INTO public.messages (
          thread_id,
          sender_id,
          role,
          content
        )
        VALUES (
          $1,
          'assistant',
          'assistant',
          $2
        )
        RETURNING
          id,
          thread_id,
          sender_id,
          role,
          content,
          metadata,
          created_at
      `,
      [threadId, response],
    );

    const aiMessage = aiInsert.rows[0];

    if (!aiMessage) {
      throw new Error("Failed to save AI response.");
    }

    // 9. Broadcast assistant response.
    await publishMessage(threadId, aiMessage);
  }

  return {
    response,
    status: result.status,
    itemCount: Array.isArray(result.items) ? result.items.length : 0,
  };
}
