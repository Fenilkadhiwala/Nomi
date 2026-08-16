import { State } from "../state";

export function readyConfirmationNode(state: State): Partial<State> {
  if (state.status === "placed") {
    return { lastResponse: `That order's already placed.` };
  }

  if (state.items.length === 0) {
    return {
      lastResponse: `The cart's empty — add something before confirming.`,
    };
  }

  const requiredApprovers = Array.from(
    new Set(state.items.map((i) => i.addedBy)),
  );

  const updatedApprovals = { ...state.approvals, [state.senderId]: true };

  const approvedCount = requiredApprovers.filter(
    (person) => updatedApprovals[person],
  ).length;
  const stillWaitingOn = requiredApprovers.filter(
    (person) => !updatedApprovals[person],
  );

  if (stillWaitingOn.length > 0) {
    return {
      status: "confirming",
      approvals: updatedApprovals,
      lastResponse: `Got it, ${state.senderId} — ${approvedCount}/${requiredApprovers.length} approved. Still waiting on: ${stillWaitingOn.join(", ")}.`,
    };
  }

  return {
    status: "placed",
    approvals: updatedApprovals,
    lastResponse: `Everyone's approved! Order placed — ${state.items.length} items ordered.`,
  };
}
