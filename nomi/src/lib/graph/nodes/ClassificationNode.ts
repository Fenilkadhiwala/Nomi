import { classifierPrompt } from "../../langchain/prompt";
import { llm } from "../../langchain/chat";
import { State } from "../state";
import { HumanMessage } from "@langchain/core/messages";
import { messageClassificationSchema } from "../schemas";

const structuredLlm = llm.withStructuredOutput(messageClassificationSchema, {
  name: "classify_message",
});

export async function classifyNode(state: State): Promise<Partial<State>> {
  const chain = classifierPrompt.pipe(structuredLlm);

  const pendingOptionsText = state.pendingOptions?.length
    ? state.pendingOptions
        .map(
          (p: any, i: number) =>
            `${i}. ${p.brand ?? ""} ${p.name} — $${(p.price_cents / 100).toFixed(2)}`,
        )
        .join("\n")
    : "none";

  const cartText = state.items?.length
    ? state.items
        .map((i: any) => `${i.name} × ${i.quantity} (added by ${i.addedBy})`)
        .join("\n")
    : "empty";

  try {
    const result = await chain.invoke({
      message: state.message,
      status: state.status ?? "collecting",
      pendingOptions: pendingOptionsText,
      cart: cartText,
      lastResponse: state.lastResponse || "none",
    });

    let itemHint = result.itemHint;
    if (!itemHint && result.url) {
      const segments = result.url.split("/").filter(Boolean);
      const guess =
        segments[segments.length - 2] ?? segments[segments.length - 1];
      itemHint = guess?.replace(/[-_]/g, " ") ?? null;
    }

    const returnedState = {
      intent: result.intent,
      url: result.url,
      itemHint,
      conversationHistory: [
        new HumanMessage(`${state.senderId}: ${state.message}`),
      ],
    };
    console.log("classification:", returnedState);

    return returnedState;
  } catch (err) {
    console.error("Classification failed, falling back to 'other':", err);
    return { intent: "other", url: null, itemHint: null };
  }
}
