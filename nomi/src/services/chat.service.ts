import { AIMessage } from "@langchain/core/messages";
import { getCompiledGraph } from "../lib/graph/graph";
import { pool } from "../lib/db/pool";
import { pusherServer } from "../lib/pusher/server";

export async function getChatResponse(
  message: string,
  senderId: string,
  threadId: string,
) {
  const userInsert = await pool.query(
    `INSERT INTO messages (thread_id, sender_id, role, content) VALUES ($1, $2, 'user', $3) RETURNING id, created_at`,
    [threadId, senderId, message],
  );

  await pusherServer.trigger(`household-${threadId}`, "new-message", {
    id: userInsert.rows[0].id,
    senderId,
    role: "user",
    content: message,
    createdAt: userInsert.rows[0].created_at,
  });

  const graph = await getCompiledGraph();
  const config = { configurable: { thread_id: threadId } };

  const result = await graph.invoke({ message, senderId }, config);

  await graph.updateState(config, {
    conversationHistory: [new AIMessage(result.lastResponse)],
  });

  if (result?.lastResponse?.trim()) {
    const aiInsert = await pool.query(
      `INSERT INTO messages (thread_id, sender_id, role, content) VALUES ($1, 'assistant', 'assistant', $2) RETURNING id, created_at`,
      [threadId, result.lastResponse],
    );

    await pusherServer.trigger(`household-${threadId}`, "new-message", {
      id: aiInsert.rows[0].id,
      senderId: "assistant",
      role: "assistant",
      content: result.lastResponse,
      createdAt: aiInsert.rows[0].created_at,
    });
  }
  return {
    response: result.lastResponse,
    status: result.status,
    itemCount: result.items.length,
  };
}
