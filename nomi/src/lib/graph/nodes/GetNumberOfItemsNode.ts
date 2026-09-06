import { llm } from "../../langchain/chat";
import { State } from "../state";
import { numberOfItemsSchema } from "../schemas";
import { numberOfItemsPrompt } from "../prompts";

const getNumberOfItemsChain = numberOfItemsPrompt.pipe(
  llm.withStructuredOutput(numberOfItemsSchema, {
    name: "extract_items",
  }),
);

export async function getNumberOfItemsNode(
  state: State,
): Promise<Partial<State>> {
  const result = await getNumberOfItemsChain.invoke({
    message: state.message,
  });

  console.log("Extracted items:", result);

  const itemQueue = result.items.map((item) => ({
    itemHint: item.item,
    quantity: item.quantity ?? 1,
  }));

  console.log("Item queue:", itemQueue);

  return {
    itemQueue,
    itemHint: itemQueue.length === 1 ? itemQueue[0].itemHint : null,
  };
}
