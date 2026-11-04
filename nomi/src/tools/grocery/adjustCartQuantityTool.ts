import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GroceryMCPClient } from "../../mcp/grocery/GroceryMCPClient";

export function createAdjustCartQuantityTool(groceryClient: GroceryMCPClient) {
  return tool(
    async ({ cartItemId, quantityChange }) => {
      const result = await groceryClient.adjustCartQuantity(
        cartItemId,
        quantityChange,
      );

      return JSON.stringify(result);
    },
    {
      name: "adjust_cart_quantity",
      description:
        "Increase or decrease the quantity of an existing cart item by a specified amount. Use positive quantityChange to increase and negative quantityChange to decrease. For example, 'add 2 more eggs' means +2, while 'reduce butter by 1' means -1. Do not use this tool when the user wants an exact final quantity.",
      schema: z.object({
        cartItemId: z
          .number()
          .int()
          .positive()
          .describe("The ID of the existing cart item"),
        quantityChange: z
          .number()
          .int()
          .refine((value) => value !== 0, {
            message: "Quantity change cannot be zero",
          })
          .describe(
            "Positive to increase quantity, negative to decrease quantity",
          ),
      }),
    },
  );
}
