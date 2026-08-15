import { State } from "../state";

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
