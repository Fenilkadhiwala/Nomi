import { llm } from "../../langchain/chat";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { State } from "../state";
import { otherPrompt } from "../prompts";

const otherChain = otherPrompt.pipe(llm).pipe(new StringOutputParser());

export async function otherNode(state: State): Promise<Partial<State>> {
  const historyText = state.conversationHistory?.length
    ? state.conversationHistory
        .slice(-10)
        .map((m) => `${m._getType()}: ${m.content}`)
        .join("\n")
    : "none yet";

  const lastResponse = await otherChain.invoke({
    message: state.message,
    history: historyText,
    senderId: state.senderId,
  });
  return { lastResponse };
}
