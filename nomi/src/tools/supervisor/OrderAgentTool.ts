import { OrderAgent } from "@/src/agents/order/OrderAgent";
import { tool } from "@langchain/core/tools";
import z from "zod";

const orderAgent = new OrderAgent();

export const orderAgentTool = tool(
  async ({ message }) => {
    console.log("Supervisor → Order Agent");

    await orderAgent.connect();

    try {
      const result = await orderAgent.run(message);

      return typeof result === "string" ? result : JSON.stringify(result);
    } finally {
      await orderAgent.disconnect();
    }
  },
  {
    name: "order_agent",

    description: `
Delegate the user's request to the Order Agent.

Use this agent for:
- placing orders
- cancelling orders
- checking order status
- modifying delivery information
- managing an existing order

Do not use this agent for product searching
or expense management.
    `.trim(),

    schema: z.object({
      message: z.string().min(1).describe("The user's order-related request"),
    }),
  },
);
