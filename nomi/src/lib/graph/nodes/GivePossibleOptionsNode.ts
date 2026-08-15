import { StringOutputParser } from "@langchain/core/output_parsers";
import { llm } from "../../langchain/chat";
import { CartItem, State } from "../state";
import { pool } from "../../db/pool";

import { optionsSchema } from "../schemas";
import { optionsResponsePrompt, quantityExtractionPrompt } from "../prompts";

const optionsChain = optionsResponsePrompt
  .pipe(llm)
  .pipe(new StringOutputParser());

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
