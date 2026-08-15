import { llm } from "../../langchain/chat";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { State } from "../state";
import { greetingPrompt } from "../prompts";

const greetingChain = greetingPrompt.pipe(llm).pipe(new StringOutputParser());

export async function greetingNode(state: State): Promise<Partial<State>> {
  const historyText = state.conversationHistory?.length
    ? state.conversationHistory
        .slice(-10)
        .map((m) => `${m._getType()}: ${m.content}`)
        .join("\n")
    : "none yet";

  const lastResponse = await greetingChain.invoke({
    message: state.message,
    history: historyText,
  });
  return { lastResponse };
}
