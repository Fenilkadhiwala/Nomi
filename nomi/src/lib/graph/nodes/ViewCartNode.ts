import { llm } from "../../langchain/chat";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { State } from "../state";
import { cartListingPrompt } from "../prompts";

const cartListingChain = cartListingPrompt
  .pipe(llm)
  .pipe(new StringOutputParser());

export async function viewCartNode(state: State): Promise<Partial<State>> {
  const lastResponse = await cartListingChain?.invoke({
    cartItems: state?.items,
  });
  return { lastResponse };
}
