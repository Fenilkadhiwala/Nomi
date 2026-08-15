import { llm } from "../../langchain/chat";
import { CartItem, State } from "../state";
import { selectionSchema } from "../schemas";
import { selectionPrompt } from "../prompts";

const structuredSelectionLlm = llm.withStructuredOutput(selectionSchema, {
  name: "resolve_selection",
});

export async function resolveSelectionNode(
  state: State,
): Promise<Partial<State>> {
  const options = state.pendingOptions ?? [];

  if (options.length === 0) {
    return {
      lastResponse: `I'm not sure what you're referring to — were you responding to something?`,
    };
  }

  let selected: any = "";
  let quantity = 1;

  const optionsList = options
    .map(
      (p, i) =>
        `${i}. ${p.brand ? p.brand + " " : ""}${p.name} (${p.pack_size}) — $${(p.price_cents / 100).toFixed(2)}`,
    )
    .join("\n");

  console.log("option list", optionsList);

  const chain = selectionPrompt.pipe(structuredSelectionLlm);
  const result = await chain.invoke({ optionsList, message: state.message });

  if (result.selectedIndex !== null && options[result.selectedIndex]) {
    selected = options[result.selectedIndex];
  }
  if (state?.pendingQuantity) {
    quantity = state.pendingQuantity;
  } else {
    // Ordinal match found via cheap path — still worth checking the raw message for a quantity
    const qtyMatch = state.message.match(/\b(\d+)\b/);
    const wordQty: Record<string, number> = {
      two: 2,
      three: 3,
      four: 4,
      five: 5,
    };
    const wordMatch = Object.keys(wordQty).find((w) =>
      state.message.toLowerCase().includes(w),
    );
    if (qtyMatch) quantity = parseInt(qtyMatch[1], 10);
    else if (wordMatch) quantity = wordQty[wordMatch];
  }

  if (!selected) {
    return {
      lastResponse: `Not sure which one you meant — could you say the number or the brand name?`,
    };
  }

  const newItem: CartItem = {
    id: crypto.randomUUID(),
    productId: selected.id,
    name: selected.name,
    priceCents: selected.price_cents,
    quantity,
    addedBy: state.senderId,
  };

  console.log("new items", newItem);

  return {
    items: [...state.items, newItem],
    pendingOptions: [], // clear once resolved
    pendingAction: "none",
    lastResponse: `Added "${selected.brand ? selected.brand + " " : ""}${selected.name}" ($${(selected.price_cents / 100).toFixed(2)}) for ${state.senderId}.`,
  };
}
