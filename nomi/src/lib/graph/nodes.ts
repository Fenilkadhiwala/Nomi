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

const optionsResponsePrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You're a friendly household grocery-ordering assistant. A user searched for an item and here are the matching product options from the catalog. Present them in a short, casual, easy-to-scan way (like a numbered list), so the user can reply with which one they want (e.g. "the first one" or the product name). Don't invent details not given to you — only use the name, brand, pack size, and price provided.`,
  ],
  [
    "human",
    `User searched for: {itemHint}
Matching options:
{optionsList}`,
  ],
]);

const optionsChain = optionsResponsePrompt
  .pipe(llm)
  .pipe(new StringOutputParser());

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

  if (rows.length === 1) {
    const selected = rows[0];
    const newItem: CartItem = {
      id: crypto.randomUUID(),
      productId: selected.id,
      name: selected.name,
      priceCents: selected.price_cents,
      quantity: 1,
      addedBy: state.senderId,
    };
    return {
      items: [...state.items, newItem],
      pendingOptions: [],
      pendingAction: "none",
      lastResponse: `Added "${selected.brand ? selected.brand + " " : ""}${selected.name}" ($${(selected.price_cents / 100).toFixed(2)}) for ${state.senderId}.`,
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
  });

  return {
    pendingAction: "select_product",
    pendingOptions: rows,
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
});
const selectionPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `The user was shown a numbered list of product options and replied with a message picking one. Match their reply to the correct option by its 0-based index. If you can't confidently tell which one they mean, return null.`,
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

  // Try cheap deterministic ordinal match first
  let selected: any = "";

  // Fall back to LLM matching for name/brand-based references

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
    quantity: 1,
    addedBy: state.senderId,
  };

  return {
    items: [...state.items, newItem],
    pendingOptions: [], // clear once resolved
    pendingAction: "none",
    lastResponse: `Added "${selected.brand ? selected.brand + " " : ""}${selected.name}" ($${(selected.price_cents / 100).toFixed(2)}) for ${state.senderId}.`,
  };
}

export function removeItemNode(state: State): Partial<State> {
  const target = state.itemHint?.toLowerCase();
  const matched = state.items.filter((i) =>
    i.name.toLowerCase().includes(target ?? "___"),
  );
  const remaining = state.items.filter((i) => !matched.includes(i));
  return {
    items: remaining,
    lastResponse: matched.length
      ? `Removed: ${matched.map((i) => i.itemHint).join(", ")}.`
      : `Couldn't find "${state.itemHint}" in the cart.`,
  };
}

export function changeQuantityNode(state: State): Partial<State> {
  return {
    lastResponse: `(TODO) Would update quantity for "${state.itemHint}".`,
  };
}

export function viewCartNode(state: State): Partial<State> {
  const summary = state.items
    .map((i) => `- ${i.name} (added by ${i.addedBy})`)
    .join("\n");
  return { lastResponse: `Current cart:\n${summary || "(empty)"}` };
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
