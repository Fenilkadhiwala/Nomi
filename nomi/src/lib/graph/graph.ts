import { StateGraph, START, END } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { GraphState, State } from "./state";
import {
  classifyNode,
  removeItemNode,
  changeQuantityNode,
  viewCartNode,
  readyConfirmationNode,
  cancelConfirmationNode,
  // expenseNode,
  otherNode,
  alreadyPlacedNode,
  givePossibleOptions,
  resolveSelectionNode,
  greetingNode,
} from "./nodes";

const builder = new StateGraph(GraphState)
  .addNode("classify", classifyNode)

  .addNode("give_possible_options", givePossibleOptions)
  .addNode("resolve_selection", resolveSelectionNode)
  .addNode("remove_item", removeItemNode)
  .addNode("change_quantity", changeQuantityNode)
  .addNode("view_cart", viewCartNode)
  .addNode("ready_confirmation", readyConfirmationNode)
  .addNode("cancel_confirmation", cancelConfirmationNode)
  // .addNode("expense", expenseNode)
  .addNode("greeting", greetingNode)
  .addNode("other", otherNode)
  .addNode("already_placed", alreadyPlacedNode)

  .addEdge(START, "classify")
  .addConditionalEdges("classify", (state: State) => {
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
      case "greeting":
        return "greeting";
      default:
        return "other";
    }
  })
  .addEdge("give_possible_options", END)
  .addEdge("resolve_selection", END)
  .addEdge("remove_item", END)
  .addEdge("change_quantity", END)
  .addEdge("view_cart", END)
  .addEdge("ready_confirmation", END)
  .addEdge("cancel_confirmation", END)
  // .addEdge("expense", END)
  .addEdge("greeting", END)
  .addEdge("other", END)
  .addEdge("already_placed", END);

// Call this once to get a compiled graph backed by Postgres persistence
export async function getCompiledGraph() {
  const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL!);
  await checkpointer.setup(); // creates the checkpoint tables if they don't exist yet
  return builder.compile({ checkpointer });
}
