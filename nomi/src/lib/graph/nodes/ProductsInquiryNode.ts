import { llm } from "../../langchain/chat";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { State } from "../state";
import { pool } from "../../db/pool";
import { productsInquiryPrompt } from "../prompts";

const productsInquiryChain = productsInquiryPrompt
  .pipe(llm)
  .pipe(new StringOutputParser());

export async function productsInquiryNode(
  state: State,
): Promise<Partial<State>> {
  if (!state.itemHint) return {};
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
  if (rows?.length === 0) {
    return {
      lastResponse: `We don't have anything matching "${state.itemHint}" in the catalog right now.`,
    };
  }
  const optionsList = rows
    .map(
      (p: any, i: any) =>
        `${i + 1}. ${p.brand ? p.brand + " " : ""}${p.name} (${p.pack_size}) — $${(p.price_cents / 100).toFixed(2)}`,
    )
    .join("\n");
  console.log("rows", optionsList);
  const lastResponse = await productsInquiryChain.invoke({
    itemHint: state.itemHint,
    optionsList,
    message: state.message,
  });
  return { lastResponse };
}
