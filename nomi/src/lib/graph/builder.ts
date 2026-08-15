import { StateGraph, START, END } from "@langchain/langgraph";
import { GraphState, State } from "./state";
import { getIntent } from "./helperFunctions";
import { classifyNode } from "./nodes/ClassificationNode";
import { givePossibleOptions } from "./nodes/GivePossibleOptionsNode";
import { resolveSelectionNode } from "./nodes/ResolveSelectionNode";
import { removeItemNode } from "./nodes/RemoveItemNode";
import { changeQuantityNode } from "./nodes/UpdateQuantityNode";
import { viewCartNode } from "./nodes/ViewCartNode";
import { readyConfirmationNode } from "./nodes/ReadyConfirmationNode";
import {
  cancelConfirmationNode,
  expenseNode,
} from "./nodes/CancelConfirmationNode";
import { greetingNode } from "./nodes/GreetingNode";
import { productsInquiryNode } from "./nodes/ProductsInquiryNode";
import { otherNode } from "./nodes/OtherCategoryNode";
import { alreadyPlacedNode } from "./nodes/AlreadyPlacedOrderNode";

export const builder = new StateGraph(GraphState)
  .addNode("classify", classifyNode)
  .addNode("give_possible_options", givePossibleOptions)
  .addNode("resolve_selection", resolveSelectionNode)
  .addNode("remove_item", removeItemNode)
  .addNode("change_quantity", changeQuantityNode)
  .addNode("view_cart", viewCartNode)
  .addNode("ready_confirmation", readyConfirmationNode)
  .addNode("cancel_confirmation", cancelConfirmationNode)
  .addNode("expense", expenseNode)
  .addNode("greeting", greetingNode)
  .addNode("products_inquiry", productsInquiryNode)
  .addNode("other", otherNode)
  .addNode("already_placed", alreadyPlacedNode)
  .addEdge(START, "classify")
  .addConditionalEdges("classify", (state: State) => {
    return getIntent(state);
  })
  .addEdge("give_possible_options", END)
  .addEdge("resolve_selection", END)
  .addEdge("remove_item", END)
  .addEdge("change_quantity", END)
  .addEdge("view_cart", END)
  .addEdge("ready_confirmation", END)
  .addEdge("cancel_confirmation", END)
  .addEdge("expense", END)
  .addEdge("greeting", END)
  .addEdge("products_inquiry", END)
  .addEdge("other", END)
  .addEdge("already_placed", END);
