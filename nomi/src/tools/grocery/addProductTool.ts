import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GroceryMCPClient } from "../../mcp/grocery/GroceryMCPClient";

export function createAddProductTool(groceryClient: GroceryMCPClient) {
  return tool(
    async ({ productId, quantity }) => {
      const result = await groceryClient.addToCart(productId, quantity);

      return JSON.stringify(result);
    },
    {
      name: "add_to_cart",
      description:
        "Add a selected grocery product to the active household cart. Use the product ID returned by search_products and the quantity requested by the user.",
      schema: z.object({
        productId: z
          .number()
          .int()
          .positive()
          .describe("The ID of the product to add to the cart"),
        quantity: z
          .number()
          .int()
          .positive()
          .describe("The quantity of the product to add"),
      }),
    },
  );
}
