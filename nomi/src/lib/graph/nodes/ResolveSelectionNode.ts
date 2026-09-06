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
  const pendingGroups = state.pendingOptions ?? [];

  console.log("Pending product groups:", pendingGroups);

  if (pendingGroups.length === 0) {
    return {
      lastResponse:
        "I'm not sure what you're referring to — there are no pending product selections.",
    };
  }

  /*
   * --------------------------------------------------
   * 1. BUILD OPTIONS LIST FOR THE LLM
   * --------------------------------------------------
   *
   * Each requested item gets its own group.
   *
   * Example:
   *
   * ITEM 0
   * Requested item: bread
   * Quantity: 1
   *
   * 0. Sara Lee Bread
   * 1. Wonder Bread
   * 2. Nature's Own Bread
   *
   * ITEM 1
   * Requested item: milk
   * ...
   */

  const optionsList = pendingGroups
    .map((group: any) => {
      const productsText = group.products
        .map(
          (product: any, index: number) =>
            `${index}. ${
              product.brand ? product.brand + " " : ""
            }${product.name}${
              product.pack_size ? ` (${product.pack_size})` : ""
            } — $${(product.price_cents / 100).toFixed(2)}`,
        )
        .join("\n");

      return `
ITEM ${group.itemIndex}
Requested item: ${group.itemHint}
Original quantity: ${group.quantity}

Available products:
${productsText}
`;
    })
    .join("\n--------------------\n");

  console.log("Options sent to selection LLM:");
  console.log(optionsList);

  /*
   * --------------------------------------------------
   * 2. ASK LLM TO RESOLVE USER'S SELECTION
   * --------------------------------------------------
   */

  const chain = selectionPrompt.pipe(structuredSelectionLlm);

  const result = await chain.invoke({
    optionsList,
    message: state.message,
  });

  console.log("Selection result:", result);

  if (!result?.selections?.length) {
    return {
      lastResponse:
        "I couldn't determine which products you selected. Please provide the product name or option number.",
    };
  }

  /*
   * --------------------------------------------------
   * 3. COPY CURRENT CART
   * --------------------------------------------------
   */

  let items = [...state.items];

  const added: string[] = [];
  const unresolved: string[] = [];

  /*
   * Track which groups were successfully resolved.
   *
   * This is important because the user might select only
   * some of the requested products.
   */

  const resolvedItemIndexes = new Set<number>();

  /*
   * --------------------------------------------------
   * 4. PROCESS EVERY SELECTION
   * --------------------------------------------------
   */

  for (const selection of result.selections) {
    const group = pendingGroups.find(
      (g: any) => g.itemIndex === selection.itemIndex,
    );

    /*
     * LLM returned an invalid itemIndex.
     */

    if (!group) {
      console.log(`Invalid itemIndex returned by LLM: ${selection.itemIndex}`);

      continue;
    }

    /*
     * User did not clearly select a product
     * for this group.
     */

    if (selection.selectedIndex === null) {
      unresolved.push(group.itemHint);
      continue;
    }

    /*
     * Find the selected product inside THIS group.
     */

    const selected = group.products[selection.selectedIndex];

    if (!selected) {
      unresolved.push(group.itemHint);
      continue;
    }

    /*
     * ------------------------------------------------
     * 5. DETERMINE QUANTITY
     * ------------------------------------------------
     *
     * Priority:
     *
     * Explicit quantity from selection LLM
     *          ↓
     * Original requested quantity
     *          ↓
     * 1
     */

    const quantity = selection.quantity ?? group.quantity ?? 1;

    /*
     * ------------------------------------------------
     * 6. CHECK IF PRODUCT ALREADY EXISTS IN CART
     * ------------------------------------------------
     */

    const existingIndex = items.findIndex(
      (item) =>
        item.productId === selected.id && item.addedBy === state.senderId,
    );

    if (existingIndex !== -1) {
      /*
       * Product already exists.
       *
       * Increase its quantity rather than creating
       * another cart row.
       */

      items = items.map((existingItem, index) =>
        index === existingIndex
          ? {
              ...existingItem,
              quantity: (existingItem.quantity ?? 0) + quantity,
            }
          : existingItem,
      );
    } else {
      /*
       * Product doesn't exist in cart.
       *
       * Add a new cart item.
       */

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

    /*
     * Mark this requested item as resolved.
     */

    resolvedItemIndexes.add(group.itemIndex);

    added.push(
      `${quantity} × ${
        selected.brand ? selected.brand + " " : ""
      }${selected.name}`,
    );
  }

  /*
   * --------------------------------------------------
   * 7. DETERMINE WHICH GROUPS ARE STILL PENDING
   * --------------------------------------------------
   */

  const remainingGroups = pendingGroups.filter(
    (group: any) => !resolvedItemIndexes.has(group.itemIndex),
  );

  /*
   * --------------------------------------------------
   * 8. BUILD RESPONSE
   * --------------------------------------------------
   */

  const responseParts: string[] = [];

  if (added.length > 0) {
    responseParts.push(`Added ${added.join(", ")} for ${state.senderId}.`);
  }

  if (remainingGroups.length > 0) {
    const remainingNames = remainingGroups
      .map((group: any) => group.itemHint)
      .join(", ");

    responseParts.push(`I still need your selection for: ${remainingNames}.`);
  }

  /*
   * --------------------------------------------------
   * 9. IF EVERYTHING IS RESOLVED
   * --------------------------------------------------
   */

  if (remainingGroups.length === 0) {
    return {
      items,

      pendingOptions: [],

      pendingQuantity: null,

      itemQueue: [],

      pendingAction: "none",

      lastResponse:
        responseParts.join(" ") ||
        "All selected products were added to your cart.",
    };
  }

  /*
   * --------------------------------------------------
   * 10. SOME ITEMS ARE STILL UNRESOLVED
   * --------------------------------------------------
   *
   * Keep only those groups in pendingOptions.
   */

  return {
    items,

    pendingOptions: remainingGroups,

    pendingAction: "select_product",

    pendingQuantity: null,

    lastResponse:
      responseParts.join(" ") || "Please select the remaining products.",
  };
}
