import { State } from "../state";

export function cancelConfirmationNode(state: State): Partial<State> {
  if (state.status === "confirming") {
    return {
      status: "collecting",
      lastResponse: `Cancelled — back to editing the cart.`,
    };
  }
  return { lastResponse: `Nothing to cancel right now.` };
}

export function expenseNode(state: State): Partial<State> {
  return { status: "expensing", lastResponse: `Expense split:\n` };
}
