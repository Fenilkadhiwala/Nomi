import { GroceryMCPClient } from "../../mcp/grocery/GroceryMCPClient";
import { llm } from "@/src/lib/langchain/chat";
import { groceryAgentFinalResponsePrompt, groceryAgentPrompt } from "./prompts";
import { createSearchProductsTool } from "../../tools/grocery/searchProductsTool";
import { createAddProductTool } from "@/src/tools/grocery/addProductTool";
import { createDisplayCartTool } from "@/src/tools/grocery/displayCartTool";

export class GroceryAgent {
  private groceryClient: GroceryMCPClient;

  constructor() {
    this.groceryClient = new GroceryMCPClient();
  }

  async connect() {
    await this.groceryClient.connect();
  }

  async disconnect() {
    await this.groceryClient.disconnect();
  }

  async run(userMessage: string, pendingOptions: any[] = []) {
    /*
     * This is the tool that Nova sees.
     *
     * The actual implementation of the tool goes through:
     *
     * GroceryAgent
     *      ↓
     * searchProductsTool
     *      ↓
     * GroceryMCPClient
     *      ↓
     * Grocery MCP Server
     *      ↓
     * product.service
     *      ↓
     * product.repository
     *      ↓
     * PostgreSQL
     */

    /*
     * Give the tool to the LLM.
     */

    const searchProductsTool = createSearchProductsTool(this.groceryClient);
    const addProductTool = createAddProductTool(this.groceryClient);
    const displayCartTool = createDisplayCartTool(this.groceryClient);
    const modelWithTools = llm.bindTools([
      searchProductsTool,
      addProductTool,
      displayCartTool,
    ]);

    const response: any = await modelWithTools.invoke([
      {
        role: "system",
        content: groceryAgentPrompt,
      },
      {
        role: "system",
        content: `
        Previously retrieved product options:
        ${JSON.stringify(pendingOptions, null, 2)}

        Use these product options when the user refers to a previously
        searched product. Reuse the exact product ID when the selection
        is clear. Do not search again unnecessarily.
      `,
      },
      {
        role: "user",
        content: userMessage,
      },
    ]);

    console.log("resss", response.tool_calls);

    /*
     * If Nova decided that a tool should be called,
     * execute the tool and send the result back to Nova.
     */
    if (response.tool_calls?.length) {
      const toolMessages = [];
      let updatedPendingOptions = pendingOptions;
      for (const toolCall of response.tool_calls) {
        console.log("tool call", toolCall);
        if (toolCall.name === "search_products") {
          const result: any = await searchProductsTool.invoke(toolCall.args);
          const products = JSON.parse(result);

          const newGroup = {
            itemIndex: updatedPendingOptions.length,
            itemHint: toolCall.args.itemHint,
            quantity: 1,
            products,
          };

          updatedPendingOptions = [...updatedPendingOptions, newGroup];

          toolMessages.push({
            role: "tool" as const,
            content: result,
            tool_call_id: toolCall.id,
          });
        } else if (toolCall.name === "add_to_cart") {
          const result: any = await addProductTool.invoke(toolCall.args);
          console.log("result in add cart tool match", JSON.parse(result));
          const fetchedResult = JSON.parse(result);
          if (fetchedResult.success) {
            const productId = Number(toolCall.args.productId);

            updatedPendingOptions = updatedPendingOptions.filter(
              (group) =>
                !group.products.some(
                  (product: any) => product.id === productId,
                ),
            );
          }
          toolMessages.push({
            role: "tool" as const,
            content: JSON.stringify(result),
            tool_call_id: toolCall.id,
          });
        } else if (toolCall.name === "display_cart") {
          const result = await displayCartTool.invoke(toolCall.args);
          toolMessages.push({
            role: "tool" as const,
            content: result,
            tool_call_id: toolCall.id,
          });
        }
      }

      /*
       * Give the search results back to Nova so it can
       * generate the final response to the user.
       */
      const finalResponse = await modelWithTools.invoke([
        {
          role: "system",
          content: groceryAgentFinalResponsePrompt,
        },
        {
          role: "user",
          content: userMessage,
        },
        response,
        ...toolMessages,
      ]);

      return {
        response: finalResponse.content,
        pendingOptions: updatedPendingOptions,
      };
    }

    /*
     * Nova decided that no tool was necessary.
     */
    return response.content;
  }
}
