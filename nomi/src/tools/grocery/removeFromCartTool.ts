import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GroceryMCPClient } from "../../mcp/grocery/GroceryMCPClient";

export function createRemoveFromCartTool(groceryClient: GroceryMCPClient) {
  return tool(
    async ({ cartItemId }) => {
      const result = await groceryClient.removeFromCart(cartItemId);

      return JSON.stringify(result);
    },
    {
      name: "remove_from_cart",
      description:
        "Remove an entire product entry from the active household cart. Use when the user explicitly asks to remove or delete a product completely. Do not use this to decrease quantity by one.",
      schema: z.object({
        cartItemId: z
          .number()
          .int()
          .positive()
          .describe("The ID of the cart item to remove"),
      }),
    },
  );
}
