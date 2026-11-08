import { AIMessage } from "@langchain/core/messages";

import { getCompiledGraph } from "../lib/graph/graph";
import { pool } from "../lib/db/pool";
import { pusherServer } from "../lib/pusher/server";

export async function getChatResponse(
  message: string,
  senderId: string,
  threadId: string,
) {
  const text = message.trim();

  if (!text) {
    throw new Error("Message cannot be empty");
  }

  // 1. Save user message
  const userInsert = await pool.query(
    `
      INSERT INTO messages (
        thread_id,
        sender_id,
        role,
        content
      )
      VALUES ($1, $2, 'user', $3)
      RETURNING id, created_at
    `,
    [threadId, senderId, text],
  );

  // 2. Broadcast user message
  await pusherServer.trigger(`household-${threadId}`, "new-message", {
    id: userInsert.rows[0].id,
    senderId,
    role: "user",
    content: text,
    createdAt: userInsert.rows[0].created_at,
  });

  // 3. Execute group-specific LangGraph thread
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

  // 4. Normalize assistant response
  const response =
    typeof result.lastResponse === "string" ? result.lastResponse.trim() : "";

  // 5. Update LangGraph conversation history
  if (response) {
    await graph.updateState(config, {
      conversationHistory: [new AIMessage(response)],
    });

    // 6. Save AI response
    const aiInsert = await pool.query(
      `
        INSERT INTO messages (
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
        RETURNING id, created_at
      `,
      [threadId, response],
    );

    // 7. Broadcast AI response
    await pusherServer.trigger(`household-${threadId}`, "new-message", {
      id: aiInsert.rows[0].id,
      senderId: "assistant",
      role: "assistant",
      content: response,
      createdAt: aiInsert.rows[0].created_at,
    });
  }

  return {
    response,
    status: result.status,
    itemCount: Array.isArray(result.items) ? result.items.length : 0,
  };
}
