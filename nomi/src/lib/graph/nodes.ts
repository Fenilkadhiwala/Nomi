import { z } from "zod";
import { llm } from "../langchain/chat";
import { State, CartItem } from "./state";
import { classifierPrompt } from "../langchain/prompt";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { pool } from "../db/pool";

const messageClassificationSchema = z.object({
  intent: z.enum([
    "add_item",
    "select_option",
    "remove_item",
    "change_quantity",
    "ready_confirmation",
    "cancel_confirmation",
    "view_cart_request",
    "expense_request",
    "greeting",
    "other",
  ]),
  url: z.string().nullable(),
  itemHint: z.string().nullable(),
});

const structuredLlm = llm.withStructuredOutput(messageClassificationSchema, {
  name: "classify_message",
});

export async function classifyNode(state: State): Promise<Partial<State>> {
  const chain = classifierPrompt.pipe(structuredLlm);
  const result = await chain.invoke({
    message: state.message,
    status: state.status,
    pendingOptions: state.pendingOptions,
    cart: state.items,
    lastResponse: state.lastResponse,
  });

  let itemHint = result.itemHint;
  if (!itemHint && result.url) {
    const segments = result.url.split("/").filter(Boolean);
    const guess =
      segments[segments.length - 2] ?? segments[segments.length - 1];
    itemHint = guess?.replace(/[-_]/g, " ") ?? null;
  }

  const returnedState = { intent: result.intent, url: result.url, itemHint };
  console.log("state here", returnedState);

  return returnedState;
}

const greetingPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You're a friendly household grocery-ordering assistant. The user just sent a greeting or casual message (not an order-related request). Respond warmly in one or two short, casual sentences. If they mentioned their name, acknowledge it naturally. Then briefly mention you can help them add items to the shared cart, view the cart, place the order, or split expenses — without sounding like a rigid menu of commands.`,
  ],
  ["human", "{message}"],
]);

const greetingChain = greetingPrompt.pipe(llm).pipe(new StringOutputParser());

export async function greetingNode(state: State): Promise<Partial<State>> {
  const lastResponse = await greetingChain.invoke({ message: state.message });
  return { lastResponse };
}

const optionsSchema = z.object({
  quantity: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe(
      "The quantity the user wants, if mentioned (e.g. 'two breads' -> 2). Null if not mentioned — default to 1 in that case.",
    ),
});

const optionsResponsePrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You're a friendly household grocery-ordering assistant. A user searched for an item and here are the matching product options from the catalog. Present them in a short, casual, easy-to-scan way (like a numbered list), so the user can reply with which one they want (e.g. "the first one" or the product name). Don't invent details not given to you — only use the name, brand, pack size, and price provided. Also note the quantity they mentioned, if any, so you can reflect it back (e.g. "how many of the Kerrygold — looks like you want 2?").`,
  ],
  [
    "human",
    `User searched for: {itemHint}
Matching options:
{optionsList}

User's message: {message}
`,
  ],
]);

const optionsChain = optionsResponsePrompt
  .pipe(llm)
  .pipe(new StringOutputParser());

const quantityExtractionPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Extract the quantity the user wants from their message, if mentioned - e.g. "add two breads" -> quantity 2, "three of the Kerrygold one" -> quantity 3. Only extract a number that clearly refers to how many of the item they want — not a price, not an option number. Return null if no quantity is mentioned (defaults to 1 elsewhere).`,
  ],
  ["human", "{message}"],
]);

const quantityExtractModel = llm.withStructuredOutput(optionsSchema, {
  name: "extract_quantity",
});

const quantityChain = quantityExtractionPrompt.pipe(quantityExtractModel);

export async function givePossibleOptions(
  state: State,
): Promise<Partial<State>> {
  if (state.intent !== "add_item" || !state.itemHint) return {};

  const { rows: allRows } = await pool.query(
    `SELECT *, similarity(search_text, $1) AS score
     FROM products
     WHERE $2 = ANY(keywords)
        OR similarity(search_text, $1) > 0.2
     ORDER BY score DESC
     LIMIT 5`,
    [state.itemHint, state.itemHint.toLowerCase()],
  );

  const topScore = allRows[0]?.score ?? 0;
  const rows = allRows.filter((r) => r.score >= topScore * 0.5).slice(0, 3);

  if (rows.length === 0) {
    return {
      lastResponse: `Couldn't find "${state.itemHint}" in the catalog — try a different name?`,
    };
  }

  const { quantity: extractedQuantity } = await quantityChain.invoke({
    message: state.message,
  });
  const quantity = extractedQuantity ?? 1;

  if (rows.length === 1) {
    const selected = rows[0];
    const newItem: CartItem = {
      id: crypto.randomUUID(),
      productId: selected.id,
      name: selected.name,
      priceCents: selected.price_cents,
      quantity,
      addedBy: state.senderId,
    };
    return {
      items: [...state.items, newItem],
      pendingOptions: [],
      pendingAction: "none",
      lastResponse: `Added ${quantity} × "${selected.brand ? selected.brand + " " : ""}${selected.name}" ($${((selected.price_cents * quantity) / 100).toFixed(2)}) for ${state.senderId}.`,
    };
  }

  const optionsList = rows
    .map(
      (p: any, i: any) =>
        `${i + 1}. ${p.brand ? p.brand + " " : ""}${p.name} (${p.pack_size}) — $${(p.price_cents / 100).toFixed(2)}`,
    )
    .join("\n");

  const lastResponse = await optionsChain.invoke({
    itemHint: state.itemHint,
    optionsList,
    message: state.message,
  });

  return {
    pendingAction: "select_product",
    pendingOptions: rows,
    pendingQuantity: quantity,
    lastResponse,
  };
}
const selectionSchema = z.object({
  selectedIndex: z
    .number()
    .nullable()
    .describe(
      "0-based index of the option the user is referring to, or null if none match clearly",
    ),
  quantity: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe(
      "The quantity the user wants, if mentioned (e.g. 'two breads' -> 2). Null if not mentioned — default to 1 in that case.",
    ),
});
const selectionPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `The user was shown a numbered list of product options and replied with a message picking one.

Match their reply to the correct option by its 0-based index. If you can't confidently tell which one they mean, return null for selectedIndex.

Also extract the quantity they want, if mentioned in their reply — e.g. "add two breads" -> quantity 2, "three of the Kerrygold one" -> quantity 3, "the Dave's Killer one" (no quantity mentioned) -> quantity null. Only extract a number that clearly refers to how many of the item they want, not a price or option number.`,
  ],
  [
    "human",
    `Options:
{optionsList}

User's reply: "{message}"`,
  ],
]);

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
const removeItemSchema = z.object({
  itemIndices: z
    .array(z.number())
    .describe(
      "0-based indices into the current cart of the item(s) to remove. Can be multiple if the user's message clearly refers to more than one item. Empty array if nothing matches clearly.",
    ),
  removeEntirely: z
    .boolean()
    .describe(
      "True if the user wants the item(s) fully removed. False if they only want to reduce the quantity (in that case, check quantityToRemove).",
    ),
  quantityToRemove: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe(
      "If the user wants to remove a partial quantity (e.g. 'remove one of the kitkats'), the amount to subtract. Null if removing the item(s) entirely or not applicable.",
    ),
});

const removeItemPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `The user wants to remove an item (or reduce its quantity) from their household's shared grocery cart.

Given the current cart and the user's message, determine:
- which cart item(s) they're referring to (by 0-based index) — there can be multiple items with similar names added by different people, so match carefully using both the item name and who added it if mentioned
- whether they want it removed entirely, or just reduced by some quantity
- if it's a partial reduction, how much to remove

If nothing in the cart clearly matches, return an empty itemIndices array.`,
  ],
  [
    "human",
    `Current cart:
{cart}

User's message: {message}`,
  ],
]);

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

const changeQuantitySchema = z.object({
  itemIndex: z
    .number()
    .nullable()
    .describe(
      "0-based index into the current cart of the item the user is referring to. Null if it doesn't clearly match any cart item.",
    ),
  quantityDelta: z
    .number()
    .int()
    .positive()
    .describe(
      "The amount to increase or decrease by. If the user gives an absolute number ('make it 3'), calculate the difference from the item's current quantity. If not mentioned, default to 1.",
    ),
  type: z.enum(["increase", "decrease"]),
});

const updateQuantityPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `The user wants to change the quantity of an item already in their household's shared grocery cart.

Given the current cart and the user's message, determine:
- which cart item they're referring to (by 0-based index)
- whether they want to increase or decrease its quantity
- by how much (if they give an absolute target like "make it 3" and the current quantity is 1, that's an increase of 2 — calculate the delta, don't just return the target number)

If the message doesn't clearly match any current cart item, return itemIndex as null.`,
  ],
  [
    "human",
    `Current cart:
{cart}

User's message: {message}`,
  ],
]);

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

const cartListingPrompt = ChatPromptTemplate?.fromMessages([
  [
    "system",
    `You're a friendly household grocery-ordering assistant, A user is requesting to view the items of the cart. Here is the cart, Present the cart items with quantity and with the senderId in a way that is very easy to read and user feels like he is viewing it in an e commerce website and always put the grand total for all the products in the end `,
  ],
  "human",
  `Cart Items: {cartItems}
  `,
]);

const cartListingChain = cartListingPrompt
  .pipe(llm)
  .pipe(new StringOutputParser());

export async function viewCartNode(state: State): Promise<Partial<State>> {
  const lastResponse = await cartListingChain?.invoke({
    cartItems: state?.items,
  });
  return { lastResponse };
}

export function readyConfirmationNode(state: State): Partial<State> {
  if (state.status === "collecting") {
    return {
      status: "confirming",
      lastResponse: `Got it — ${state.items.length} items. Confirm to place the order?`,
    };
  }
  if (state.status === "confirming") {
    return {
      status: "placed",
      lastResponse: `Order placed! ${state.items.length} items ordered.`,
    };
  }
  return { lastResponse: `Nothing pending to confirm.` };
}

export function cancelConfirmationNode(state: State): Partial<State> {
  if (state.status === "confirming") {
    return {
      status: "collecting",
      lastResponse: `Cancelled — back to editing the cart.`,
    };
  }
  return { lastResponse: `Nothing to cancel right now.` };
}

// export function expenseNode(state: State): Partial<State> {
//   const byPerson: Record<string, string[]> = {};
//   for (const item of state.items) {
//     byPerson[item.addedBy] ??= [];
//     byPerson[item.addedBy].push(item.itemHint);
//   }
//   const summary = Object.entries(byPerson)
//     .map(([person, items]) => `${person}: ${items.join(", ")}`)
//     .join("\n");
//   return { status: "expensing", lastResponse: `Expense split:\n${summary}` };
// }

export function otherNode(state: State): Partial<State> {
  return {
    lastResponse: `Sorry, I didn't understand that as an order-related request.`,
  };
}

export function alreadyPlacedNode(state: State): Partial<State> {
  return {
    lastResponse: `That order's already placed. Want to start a new order?`,
  };
}
