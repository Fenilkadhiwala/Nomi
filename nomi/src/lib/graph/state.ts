import { BaseMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";

export type CartItem = {
  id: string;
  productId: string;
  name: string;
  priceCents: number;
  itemHint?: string;
  url?: string | null;
  quantity: number;
  addedBy: string;
};

export const GraphState = Annotation.Root({
  message: Annotation<string>(),
  senderId: Annotation<string>(),
  intent: Annotation<string>(),
  url: Annotation<string | null>(),
  itemHint: Annotation<string | null>(),
  target: Annotation<"agent" | "household">({
    reducer: (current, update) => update ?? current,
  }),
  pendingAction: Annotation<"none" | "select_product" | "confirm_order">({
    reducer: (current, update) => update ?? current,
    default: () => "none",
  }),
  pendingOptions: Annotation<any[]>({
    reducer: (current, update) => update ?? current,
    default: () => [],
  }),
  items: Annotation<CartItem[]>({
    reducer: (current, update) => update ?? current,
    default: () => [],
  }),
  status: Annotation<"collecting" | "confirming" | "placed" | "expensing">({
    reducer: (current, update) => update ?? current,
    default: () => "collecting",
  }),
  lastResponse: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => "",
  }),
  pendingQuantity: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 1,
  }),

  conversationHistory: Annotation<BaseMessage[]>({
    reducer: (current, update) => (current ?? []).concat(update ?? []),
    default: () => [],
  }),

  approvals: Annotation<Record<string, boolean>>({
    reducer: (current, update) => ({ ...(current ?? {}), ...(update ?? {}) }),
    default: () => ({}),
  }),
});

export type State = typeof GraphState.State;
