import { GroceryAgent } from "@/src/agents/grocery/GroceryAgent";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const groceryAgent = new GroceryAgent();

const pendingProductSchema = z.object({
  id: z.number().int(),
  brand: z.string().nullable().optional(),
  name: z.string(),
  pack_size: z.string().nullable().optional(),
  price_cents: z.number(),
});

const pendingOptionsSchema = z.array(
  z.object({
    itemIndex: z.number(),
    itemHint: z.string(),
    quantity: z.number(),
    products: z.array(pendingProductSchema),
  }),
);

export const groceryAgentTool = tool(
  async ({ message, pendingOptions }) => {
    console.log("Supervisor → Grocery Agent", message);

    await groceryAgent.connect();

    try {
      const result = await groceryAgent.run(message, pendingOptions);

      console.log("results from tools", result);

      return {
        lastResponse: result.response,
        pendingOptions: result.pendingOptions,
      };
    } finally {
      await groceryAgent.disconnect();
    }
  },
  {
    name: "grocery_agent",
    description: `
Delegate grocery-related requests to the Grocery Agent.
Use it for searching products, finding product options,
adding grocery items, removing items, changing quantities,
and viewing the cart.

Do not use it for placing/cancelling orders or managing expenses.
    `.trim(),

    schema: z.object({
      message: z.string().min(1),
      pendingOptions: pendingOptionsSchema
        .default([])
        .describe("Previously retrieved product options, if available"),
    }),
  },
);
