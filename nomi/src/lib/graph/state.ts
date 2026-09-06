import { BaseMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";

/*
 * ============================================================
 * CART ITEM
 * ============================================================
 */

export type CartItem = {
  id: string;
  productId: string;
  name: string;
  priceCents: number;
  itemHint?: string;
  url?: string | null;
  quantity: number | null;
  addedBy: string;
};

/*
 * ============================================================
 * PENDING PRODUCT
 * ============================================================
 *
 * A product returned from the database while Nomi is waiting
 * for the user to select a product.
 *
 * Example:
 *
 * {
 *   id: 123,
 *   brand: "Silk",
 *   name: "Almond Milk Original",
 *   pack_size: "1/2 gal",
 *   price_cents: 399
 * }
 *
 * IMPORTANT:
 * This represents an ACTUAL catalog product.
 * It does NOT contain information about which requested item
 * it belongs to.
 *
 * That information is stored in PendingProductGroup.
 */

export type PendingProduct = {
  id: string;
  brand?: string | null;
  name: string;
  pack_size?: string | null;
  price_cents: number;
};

/*
 * ============================================================
 * PENDING PRODUCT GROUP
 * ============================================================
 *
 * Represents one requested grocery item and all possible
 * products that can satisfy that request.
 *
 * Example:
 *
 * User:
 * "Add bread, milk and rice"
 *
 * pendingOptions:
 *
 * [
 *   {
 *     itemIndex: 0,
 *     itemHint: "bread",
 *     quantity: 1,
 *     products: [...]
 *   },
 *
 *   {
 *     itemIndex: 1,
 *     itemHint: "milk",
 *     quantity: 1,
 *     products: [...]
 *   },
 *
 *   {
 *     itemIndex: 2,
 *     itemHint: "rice",
 *     quantity: 1,
 *     products: [...]
 *   }
 * ]
 */

export type PendingProductGroup = {
  itemIndex: number;

  /*
   * What the user originally asked for.
   * Example: "bread", "milk", "rice"
   */
  itemHint: string;

  /*
   * Quantity requested by the user.
   */
  quantity: number;

  /*
   * Actual catalog products that could satisfy this request.
   */
  products: PendingProduct[];
};

/*
 * ============================================================
 * QUEUED ITEM
 * ============================================================
 *
 * Represents the items extracted from the user's original
 * add-item request.
 *
 * Example:
 *
 * User:
 * "Add 2 onions, 3 milk and 4 eggs"
 *
 * itemQueue:
 *
 * [
 *   { itemHint: "onions", quantity: 2 },
 *   { itemHint: "milk", quantity: 3 },
 *   { itemHint: "eggs", quantity: 4 }
 * ]
 */

export type QueuedItem = {
  itemHint: string;
  quantity: number | null;
};

/*
 * ============================================================
 * GRAPH STATE
 * ============================================================
 */

export const GraphState = Annotation.Root({
  /*
   * ----------------------------------------------------------
   * CURRENT USER MESSAGE
   * ----------------------------------------------------------
   */

  message: Annotation<string>(),

  /*
   * ----------------------------------------------------------
   * USER
   * ----------------------------------------------------------
   */

  senderId: Annotation<string>(),

  /*
   * ----------------------------------------------------------
   * CLASSIFICATION
   * ----------------------------------------------------------
   */

  intent: Annotation<string>(),

  url: Annotation<string | null>(),

  /*
   * For a single-item request this may contain the item.
   *
   * For multiple-item requests, itemQueue contains all items.
   */

  itemHint: Annotation<string | null>(),

  /*
   * ----------------------------------------------------------
   * TARGET
   * ----------------------------------------------------------
   *
   * Determines whether the message is intended for Nomi
   * or the household/group conversation.
   */

  target: Annotation<"agent" | "household">({
    reducer: (current, update) => update ?? current,
    default: () => "agent",
  }),

  /*
   * ----------------------------------------------------------
   * ITEM QUEUE
   * ----------------------------------------------------------
   *
   * Created by GetNumberOfItemsNode.
   *
   * Example:
   *
   * User:
   * "Can you add 2 bread, milk and 3 rice?"
   *
   * itemQueue:
   *
   * [
   *   { itemHint: "bread", quantity: 2 },
   *   { itemHint: "milk", quantity: 1 },
   *   { itemHint: "rice", quantity: 3 }
   * ]
   */

  itemQueue: Annotation<QueuedItem[]>({
    reducer: (_current, update) => update ?? [],
    default: () => [],
  }),

  /*
   * ----------------------------------------------------------
   * PENDING ACTION
   * ----------------------------------------------------------
   *
   * select_product:
   * Nomi has shown product options and is waiting for the
   * user to select one or more products.
   *
   * confirm_order:
   * Nomi is waiting for order confirmation.
   */

  pendingAction: Annotation<"none" | "select_product" | "confirm_order">({
    reducer: (current, update) => update ?? current,
    default: () => "none",
  }),

  /*
   * ----------------------------------------------------------
   * PENDING OPTIONS
   * ----------------------------------------------------------
   *
   * IMPORTANT:
   *
   * This is now GROUPED by requested grocery item.
   *
   * Example:
   *
   * [
   *   {
   *     itemIndex: 0,
   *     itemHint: "bread",
   *     quantity: 1,
   *     products: [
   *       {
   *         id: "1",
   *         brand: "Sara Lee",
   *         name: "Artesano Bread",
   *         pack_size: "20 oz loaf",
   *         price_cents: 429
   *       },
   *       ...
   *     ]
   *   },
   *
   *   {
   *     itemIndex: 1,
   *     itemHint: "milk",
   *     quantity: 1,
   *     products: [...]
   *   }
   * ]
   *
   * This allows resolveSelectionNode to understand which
   * products belong to which requested item.
   */

  pendingOptions: Annotation<PendingProductGroup[]>({
    reducer: (_current, update) => update ?? [],
    default: () => [],
  }),

  /*
   * ----------------------------------------------------------
   * CART ITEMS
   * ----------------------------------------------------------
   */

  items: Annotation<CartItem[]>({
    reducer: (_current, update) => update ?? [],
    default: () => [],
  }),

  /*
   * ----------------------------------------------------------
   * ORDER STATUS
   * ----------------------------------------------------------
   */

  status: Annotation<"collecting" | "confirming" | "placed" | "expensing">({
    reducer: (current, update) => update ?? current,
    default: () => "collecting",
  }),

  /*
   * ----------------------------------------------------------
   * LAST AI RESPONSE
   * ----------------------------------------------------------
   */

  lastResponse: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => "",
  }),

  /*
   * ----------------------------------------------------------
   * PENDING QUANTITY
   * ----------------------------------------------------------
   *
   * Used primarily for the old/single-item selection flow.
   *
   * For multiple requested items, quantity is stored directly
   * inside PendingProductGroup.quantity.
   */

  pendingQuantity: Annotation<number | null>({
    reducer: (_current, update) => update,
    default: () => null,
  }),

  /*
   * ----------------------------------------------------------
   * CONVERSATION HISTORY
   * ----------------------------------------------------------
   */

  conversationHistory: Annotation<BaseMessage[]>({
    reducer: (current, update) => (current ?? []).concat(update ?? []),
    default: () => [],
  }),

  /*
   * ----------------------------------------------------------
   * APPROVALS
   * ----------------------------------------------------------
   */

  approvals: Annotation<Record<string, boolean>>({
    reducer: (current, update) => ({
      ...(current ?? {}),
      ...(update ?? {}),
    }),
    default: () => ({}),
  }),
});

/*
 * ============================================================
 * STATE TYPE
 * ============================================================
 */

export type State = typeof GraphState.State;
