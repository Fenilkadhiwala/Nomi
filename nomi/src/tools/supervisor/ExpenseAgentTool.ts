import { ExpenseAgent } from "@/src/agents/expense/ExpenseAgent";
import { tool } from "@langchain/core/tools";
import z from "zod";

const expenseAgent = new ExpenseAgent();

export const expenseAgentTool = tool(
  async ({ message }) => {
    console.log("Supervisor → Expense Agent");

    await expenseAgent.connect();

    try {
      const result = await expenseAgent.run(message);

      return typeof result === "string" ? result : JSON.stringify(result);
    } finally {
      await expenseAgent.disconnect();
    }
  },
  {
    name: "expense_agent",

    description: `
Delegate the user's request to the Expense Agent.

Use this agent for:
- creating expenses
- splitting expenses
- calculating shares
- checking balances
- settling expenses
- viewing household expenses

Do not use this agent for grocery products
or order management.
    `.trim(),

    schema: z.object({
      message: z.string().min(1).describe("The user's expense-related request"),
    }),
  },
);
