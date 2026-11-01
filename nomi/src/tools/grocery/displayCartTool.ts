import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GroceryMCPClient } from "../../mcp/grocery/GroceryMCPClient";

export function createDisplayCartTool(groceryClient: GroceryMCPClient) {
  return tool(
    async () => {
      const result = await groceryClient.displayCart();

      return JSON.stringify(result);
    },
    {
      name: "display_cart",
      description:
        "Display the current active household grocery cart, including the products, quantities, prices, and cart details. Use this tool when the user asks to view, show, or check their cart. Do not use it to add or modify products.",
      schema: z.object({}),
    },
  );
}
