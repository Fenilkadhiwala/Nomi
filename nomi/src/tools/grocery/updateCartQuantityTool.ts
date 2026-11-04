import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GroceryMCPClient } from "../../mcp/grocery/GroceryMCPClient";

export function createUpdateCartQuantityTool(groceryClient: GroceryMCPClient) {
  return tool(
    async ({ cartItemId, quantity }) => {
      const result = await groceryClient.updateCartQuantity(
        cartItemId,
        quantity,
      );

      return JSON.stringify(result);
    },
    {
      name: "update_cart_quantity",
      description:
        "Set an existing cart item's quantity to an exact number. Use when the user says things like 'make eggs 3', 'change milk quantity to 2', or 'set butter to 4'. This replaces the existing quantity rather than adding to it.",
      schema: z.object({
        cartItemId: z
          .number()
          .int()
          .positive()
          .describe("The ID of the existing cart item"),
        quantity: z
          .number()
          .int()
          .positive()
          .describe("The exact new quantity to set"),
      }),
    },
  );
}
