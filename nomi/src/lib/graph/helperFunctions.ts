import { State } from "./state";

export const getIntent = (state: State) => {
  const mutatingIntents = ["add_item", "remove_item", "change_quantity"];

  if (state.pendingAction === "select_product") {
    return "resolve_selection";
  }

  if (state.pendingAction === "confirm_order") {
    return "ready_confirmation";
  }

  if (state.status === "placed" && mutatingIntents.includes(state.intent)) {
    return "already_placed";
  }
  switch (state.intent) {
    case "add_item":
      return "give_possible_options";
    case "remove_item":
      return "remove_item";
    case "change_quantity":
      return "change_quantity";
    case "view_cart_request":
      return "view_cart";
    case "ready_confirmation":
      return "ready_confirmation";
    case "cancel_confirmation":
      return "cancel_confirmation";
    case "expense_request":
      return "expense";
    case "products_inquiry":
      return "products_inquiry";
    case "greeting":
      return "greeting";
    default:
      return "other";
  }
};
