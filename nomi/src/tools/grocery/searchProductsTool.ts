import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GroceryMCPClient } from "../../mcp/grocery/GroceryMCPClient";

export function createSearchProductsTool(groceryClient: GroceryMCPClient) {
  return tool(
    async ({ itemHint }) => {
      const products = await groceryClient.searchProducts(itemHint);

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
}
