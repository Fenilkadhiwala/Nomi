import { llm } from "../../langchain/chat";
import { State } from "../state";
import { removeItemSchema } from "../schemas";
import { removeItemPrompt } from "../prompts";

const structuredRemoveLlm = llm.withStructuredOutput(removeItemSchema, {
  name: "remove_item",
});

const removeItemChain = removeItemPrompt.pipe(structuredRemoveLlm);

export async function removeItemNode(state: State): Promise<Partial<State>> {
  if (state.items.length === 0) {
    return { lastResponse: `Your cart is already empty — nothing to remove.` };
  }

  const cartText = state.items
    .map(
      (i, idx) =>
        `${idx}. ${i.name} — qty ${i.quantity} (added by ${i.addedBy})`,
    )
    .join("\n");

  const result = await removeItemChain.invoke({
    cart: cartText,
    message: state.message,
  });

  if (result.itemIndices.length === 0) {
    return {
      lastResponse: `Couldn't find that in the cart — could you name the item more specifically?`,
    };
  }

  const removedNames: string[] = [];
  let updatedItems = [...state.items];

  for (const idx of [...result.itemIndices].sort((a, b) => b - a)) {
    const target = updatedItems[idx];
    if (!target) continue;

    if (
      !result.removeEntirely &&
      result.quantityToRemove &&
      result.quantityToRemove < target.quantity
    ) {
      const newQuantity = target.quantity - result.quantityToRemove;
      updatedItems[idx] = { ...target, quantity: newQuantity };
      removedNames.push(
        `${result.quantityToRemove} × ${target.name} (now ${newQuantity} left)`,
      );
    } else {
      updatedItems.splice(idx, 1);
      removedNames.push(target.name);
    }
  }

  return {
    items: updatedItems,
    lastResponse: `Removed: ${removedNames.join(", ")}.`,
  };
}
