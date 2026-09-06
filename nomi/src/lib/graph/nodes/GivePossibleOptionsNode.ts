import { StringOutputParser } from "@langchain/core/output_parsers";
import { llm } from "../../langchain/chat";
import { CartItem, PendingProductGroup, State } from "../state";
import { pool } from "../../db/pool";

import {
  optionsResponsePrompt,
  optionsResponseForMultipleProductsPrompt,
} from "../prompts";

const optionsChain = optionsResponsePrompt
  .pipe(llm)
  .pipe(new StringOutputParser());

const optionsForMultipleProductsChain = optionsResponseForMultipleProductsPrompt
  .pipe(llm)
  .pipe(new StringOutputParser());

export async function givePossibleOptions(
  state: State,
): Promise<Partial<State>> {
  if (state.intent !== "add_item") {
    return {};
  }

  const itemQueue = state.itemQueue ?? [];

  if (itemQueue.length === 0) {
    return {
      lastResponse: "I couldn't determine which items you want to add.",
    };
  }

  console.log("Item queue:", itemQueue);

  /*
   * ============================================================
   * SINGLE ITEM
   * ============================================================
   */

  if (itemQueue.length === 1) {
    const requestedItem = itemQueue[0];

    const { rows: allRows } = await pool.query(
      `SELECT *,
              similarity(search_text, $1) AS score
       FROM products
       WHERE $2 = ANY(keywords)
          OR similarity(search_text, $1) > 0.2
       ORDER BY score DESC
       LIMIT 5`,
      [requestedItem.itemHint, requestedItem.itemHint.toLowerCase()],
    );

    const topScore = allRows[0]?.score ?? 0;

    const rows = allRows.filter((r) => r.score >= topScore * 0.5).slice(0, 3);
    console.log("rows", rows);

    console.log(`Results for ${requestedItem.itemHint}:`, rows);

    /*
     * No products found.
     */

    if (rows.length === 0) {
      return {
        itemQueue: [],
        pendingOptions: [],
        pendingAction: "none",
        lastResponse:
          `Couldn't find "${requestedItem.itemHint}" in the catalog — ` +
          `try a different name?`,
      };
    }

    /*
     * ============================================================
     * EXACTLY ONE PRODUCT
     * ============================================================
     *
     * Automatically add it to cart.
     */

    if (rows.length === 1) {
      const selected = rows[0];

      const quantity = requestedItem.quantity ?? 1;

      let items = [...state.items];

      const existingIndex = items.findIndex(
        (item) =>
          item.productId === selected.id && item.addedBy === state.senderId,
      );

      if (existingIndex !== -1) {
        items = items.map((item, index) =>
          index === existingIndex
            ? {
                ...item,
                quantity: (item.quantity ?? 0) + quantity,
              }
            : item,
        );
      } else {
        const newItem: CartItem = {
          id: crypto.randomUUID(),
          productId: selected.id,
          name: selected.name,
          priceCents: selected.price_cents,
          quantity,
          addedBy: state.senderId,
        };

        items.push(newItem);
      }

      return {
        items,

        itemQueue: [],

        pendingOptions: [],

        pendingQuantity: null,

        pendingAction: "none",

        lastResponse:
          `Added ${quantity} × "` +
          `${selected.brand ? selected.brand + " " : ""}` +
          `${selected.name}" ` +
          `($${((selected.price_cents * quantity) / 100).toFixed(2)}) ` +
          `for ${state.senderId}.`,
      };
    }

    /*
     * ============================================================
     * MULTIPLE PRODUCT OPTIONS
     * ============================================================
     */

    const optionsList = rows
      .map(
        (p: any, i: number) =>
          `${i + 1}. ${p.brand ? p.brand + " " : ""}${p.name} ${
            p.pack_size ? `(${p.pack_size})` : ""
          } — $${(p.price_cents / 100).toFixed(2)}`,
      )
      .join("\n");

    const lastResponse = await optionsChain.invoke({
      itemHint: requestedItem.itemHint,
      optionsList,
      message: state.message,
    });

    /*
     * IMPORTANT:
     *
     * pendingOptions is now PendingProductGroup[].
     *
     * We do NOT attach requestedItem/requestedQuantity
     * directly to each product anymore.
     */

    const pendingOptions: PendingProductGroup[] = [
      {
        itemIndex: 0,

        itemHint: requestedItem.itemHint,

        quantity: requestedItem.quantity ?? 1,

        products: rows.map((product: any) => ({
          id: product.id,
          brand: product.brand,
          name: product.name,
          pack_size: product.pack_size,
          price_cents: product.price_cents,
        })),
      },
    ];

    return {
      pendingAction: "select_product",

      pendingOptions,

      pendingQuantity: requestedItem.quantity ?? 1,

      lastResponse,
    };
  }

  /*
   * ============================================================
   * MULTIPLE UNIQUE ITEMS
   * ============================================================
   */

  console.log(`Multiple unique items detected: ${itemQueue.length}`);

  let items = [...state.items];

  const pendingOptions: PendingProductGroup[] = [];

  const autoAdded: string[] = [];

  const notFound: string[] = [];

  /*
   * ============================================================
   * SEARCH EACH REQUESTED ITEM
   * ============================================================
   */

  for (let itemIndex = 0; itemIndex < itemQueue.length; itemIndex++) {
    const requestedItem = itemQueue[itemIndex];

    console.log(`Searching products for: ${requestedItem.itemHint}`);

    const { rows: allRows } = await pool.query(
      `SELECT *,
              similarity(search_text, $1) AS score
       FROM products
       WHERE $2 = ANY(keywords)
          OR similarity(search_text, $1) > 0.2
       ORDER BY score DESC
       LIMIT 5`,
      [requestedItem.itemHint, requestedItem.itemHint.toLowerCase()],
    );

    const topScore = allRows[0]?.score ?? 0;

    const rows = allRows.filter((r) => r.score >= topScore * 0.5).slice(0, 3);

    console.log(`Found ${rows.length} options for ${requestedItem.itemHint}`);

    /*
     * ----------------------------------------------------------
     * NOTHING FOUND
     * ----------------------------------------------------------
     */

    if (rows.length === 0) {
      notFound.push(requestedItem.itemHint);
      continue;
    }

    /*
     * ----------------------------------------------------------
     * EXACTLY ONE PRODUCT
     * ----------------------------------------------------------
     *
     * Automatically add.
     */

    if (rows.length === 1) {
      const selected = rows[0];

      const quantity = requestedItem.quantity ?? 1;

      const existingIndex = items.findIndex(
        (item) =>
          item.productId === selected.id && item.addedBy === state.senderId,
      );

      if (existingIndex !== -1) {
        items = items.map((item, index) =>
          index === existingIndex
            ? {
                ...item,
                quantity: (item.quantity ?? 0) + quantity,
              }
            : item,
        );
      } else {
        const newItem: CartItem = {
          id: crypto.randomUUID(),
          productId: selected.id,
          name: selected.name,
          priceCents: selected.price_cents,
          quantity,
          addedBy: state.senderId,
        };

        items.push(newItem);
      }

      autoAdded.push(
        `${quantity} × ${
          selected.brand ? selected.brand + " " : ""
        }${selected.name}`,
      );

      continue;
    }

    /*
     * ----------------------------------------------------------
     * MULTIPLE PRODUCTS FOUND
     * ----------------------------------------------------------
     *
     * Create ONE PendingProductGroup for this requested item.
     */

    const productOptions = rows.map((product: any) => ({
      id: product.id,
      brand: product.brand,
      name: product.name,
      pack_size: product.pack_size,
      price_cents: product.price_cents,
    }));

    pendingOptions.push({
      itemIndex,

      itemHint: requestedItem.itemHint,

      quantity: requestedItem.quantity ?? 1,

      products: productOptions,
    });
  }

  console.log("Final pending product groups:", pendingOptions);

  /*
   * ============================================================
   * BUILD OPTIONS MESSAGE
   * ============================================================
   */

  if (pendingOptions.length > 0) {
    const groupsText = pendingOptions
      .map((group) => {
        const options = group.products
          .map(
            (product, index) =>
              `${index + 1}. ${
                product.brand ? product.brand + " " : ""
              }${product.name} ${
                product.pack_size ? `(${product.pack_size})` : ""
              } — $${(product.price_cents / 100).toFixed(2)}`,
          )
          .join("\n");

        return `
Item ${group.itemIndex + 1}: ${group.itemHint}
Quantity: ${group.quantity}

Available products:
${options}
`;
      })
      .join("\n--------------------\n");

    console.log("Groups text:", groupsText);

    const optionsMsg = await optionsForMultipleProductsChain.invoke({
      groupsText,
    });

    /*
     * ==========================================================
     * RESPONSE
     * ==========================================================
     */

    const responseParts: string[] = [];

    if (autoAdded.length > 0) {
      responseParts.push(`Added ${autoAdded.join(", ")}.`);
    }

    if (notFound.length > 0) {
      responseParts.push(
        `I couldn't find ${notFound.join(", ")} in the catalog.`,
      );
    }

    responseParts.push(optionsMsg);

    return {
      items,

      /*
       * IMPORTANT:
       * This is PendingProductGroup[] now.
       */
      pendingOptions,

      /*
       * Quantity lives inside each group.
       */
      pendingQuantity: null,

      /*
       * Keep the queue while selection is pending.
       */
      itemQueue,

      pendingAction: "select_product",

      lastResponse: responseParts.join("\n\n"),
    };
  }

  /*
   * ============================================================
   * EVERYTHING WAS AUTOMATICALLY ADDED
   * ============================================================
   */

  const responseParts: string[] = [];

  if (autoAdded.length > 0) {
    responseParts.push(`Added ${autoAdded.join(", ")}.`);
  }

  if (notFound.length > 0) {
    responseParts.push(
      `I couldn't find ${notFound.join(", ")} in the catalog.`,
    );
  }

  return {
    items,

    itemQueue: [],

    pendingOptions: [],

    pendingQuantity: null,

    pendingAction: "none",

    lastResponse:
      responseParts.join(" ") || "I couldn't add the requested items.",
  };
}
