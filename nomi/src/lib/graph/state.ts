import { BaseMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";

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

export type PendingProduct = {
  id: number;
  brand?: string | null;
  name: string;
  pack_size?: string | null;
  price_cents: number;
};

export type PendingProductGroup = {
  itemIndex: number;
  itemHint: string;
  quantity: number;
  products: PendingProduct[];
};

export type QueuedItem = {
  itemHint: string;
  quantity: number | null;
};

export const GraphState = Annotation.Root({
  message: Annotation<string>(),
  senderId: Annotation<string>(),

  intent: Annotation<string>(),
  url: Annotation<string | null>(),
  itemHint: Annotation<string | null>(),

  target: Annotation<"agent" | "household">({
    reducer: (_, update) => update ?? "agent",
    default: () => "agent",
  }),

  itemQueue: Annotation<QueuedItem[]>({
    reducer: (_, update) => update ?? [],
    default: () => [],
  }),

  pendingAction: Annotation<"none" | "select_product" | "confirm_order">({
    reducer: (_, update) => update ?? "none",
    default: () => "none",
  }),

  pendingOptions: Annotation<PendingProductGroup[]>({
    reducer: (_, update) => update ?? [],
    default: () => [],
  }),

  items: Annotation<CartItem[]>({
    reducer: (_, update) => update ?? [],
    default: () => [],
  }),

  status: Annotation<"collecting" | "confirming" | "placed" | "expensing">({
    reducer: (_, update) => update ?? "collecting",
    default: () => "collecting",
  }),

  lastResponse: Annotation<string>({
    reducer: (_, update) => update ?? "",
    default: () => "",
  }),

  pendingQuantity: Annotation<number | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  conversationHistory: Annotation<BaseMessage[]>({
    reducer: (current, update) => [...(current ?? []), ...(update ?? [])],
    default: () => [],
  }),

  approvals: Annotation<Record<string, boolean>>({
    reducer: (current, update) => ({
      ...(current ?? {}),
      ...(update ?? {}),
    }),
    default: () => ({}),
  }),
});

export type State = typeof GraphState.State;
