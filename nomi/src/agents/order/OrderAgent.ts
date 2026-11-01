import { ChatBedrockConverse } from "@langchain/aws";
import { GroceryMCPClient } from "../../mcp/grocery/GroceryMCPClient";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { llm } from "@/src/lib/langchain/chat";

export class OrderAgent {
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

  async run(userMessage: string) {
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
    const searchProductsTool: any = tool(
      async ({ itemHint }) => {
        const products = await this.groceryClient.searchProducts(itemHint);

        return JSON.stringify(products);
      },
      {
        name: "search_products",
        description:
          "Search the Nomi grocery catalog for products matching a grocery item. " +
          "Use this when the user wants to find a grocery product.",
        schema: z.object({
          itemHint: z
            .string()
            .min(1)
            .describe("The grocery item the user wants to search for"),
        }),
      },
    );

    /*
     * Give the tool to the LLM.
     */
    const modelWithTools = llm.bindTools([searchProductsTool]);

    const response = await modelWithTools.invoke([
      {
        role: "system",
        content: `
You are Nomi's Grocery Agent.

Your job is to help users with grocery-related requests.

You have access to a grocery product search tool.

When the user asks to find, search for, or get options for a grocery item,
use the search_products tool.

Do not invent products or prices.
Use the tool when product information is needed.

After receiving the tool results, respond naturally and clearly to the user.
        `.trim(),
      },
      {
        role: "user",
        content: userMessage,
      },
    ]);

    console.log("resss", response);

    /*
     * If Nova decided that a tool should be called,
     * execute the tool and send the result back to Nova.
     */
    if (response.tool_calls?.length) {
      const toolMessages = [];

      for (const toolCall of response.tool_calls) {
        if (toolCall.name === "search_products") {
          const result = await searchProductsTool.invoke(toolCall.args);

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
          content: `
You are Nomi's Grocery Agent.

Use the tool results to answer the user's request.

Present relevant grocery products clearly.
Include the product name, brand, package size, and price when available.

Do not invent information that was not returned by the tool.
          `.trim(),
        },
        {
          role: "user",
          content: userMessage,
        },
        response,
        ...toolMessages,
      ]);

      return finalResponse.content;
    }

    /*
     * Nova decided that no tool was necessary.
     */
    return response.content;
  }
}
