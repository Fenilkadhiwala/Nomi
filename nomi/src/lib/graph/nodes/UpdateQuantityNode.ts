import { llm } from "../../langchain/chat";
import { State } from "../state";
import { changeQuantitySchema } from "../schemas";
import { updateQuantityPrompt } from "../prompts";

const structuredQuantityLlm = llm.withStructuredOutput(changeQuantitySchema, {
  name: "change_quantity",
});

const updateQuantityChain = updateQuantityPrompt.pipe(structuredQuantityLlm);

export async function changeQuantityNode(
  state: State,
): Promise<Partial<State>> {
  if (state.items.length === 0) {
    return { lastResponse: `Your cart is empty — nothing to update yet.` };
  }

  const cartText = state.items
    .map(
      (i, idx) =>
        `${idx}. ${i.name} — qty ${i.quantity} (added by ${i.addedBy})`,
    )
    .join("\n");

  const result = await updateQuantityChain.invoke({
    cart: cartText,
    message: state.message,
  });

  if (result.itemIndex === null || !state.items[result.itemIndex]) {
    return {
      lastResponse: `Not sure which item you meant — could you name it or say "the first one"?`,
    };
  }

  const targetItem = state.items[result.itemIndex];
  const delta =
    result.type === "increase" ? result.quantityDelta : -result.quantityDelta;
  const newQuantity = Math.max(0, targetItem.quantity + delta);

  const updatedItems = state.items.map((item, idx) =>
    idx === result.itemIndex ? { ...item, quantity: newQuantity } : item,
  );

  if (newQuantity === 0) {
    return {
      items: updatedItems.filter((_, idx) => idx !== result.itemIndex),
      lastResponse: `Removed "${targetItem.name}" from the cart (quantity reached 0).`,
    };
  }

  return {
    items: updatedItems,
    lastResponse: `Updated "${targetItem.name}" to qty ${newQuantity} for ${targetItem.addedBy}.`,
  };
}
