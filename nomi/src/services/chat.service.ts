import { AIMessage } from "@langchain/core/messages";
import { getCompiledGraph } from "../lib/graph/graph";

export async function getChatResponse(
  message: string,
  senderId: string,
  threadId: string,
) {
  const graph = await getCompiledGraph();
  const config = { configurable: { thread_id: threadId } };

  const result = await graph.invoke({ message, senderId }, config);

  await graph.updateState(config, {
    conversationHistory: [new AIMessage(result.lastResponse)],
  });

  return {
    response: result.lastResponse,
    status: result.status,
    itemCount: result.items.length,
  };
}
