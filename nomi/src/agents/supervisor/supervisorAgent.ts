import { llm } from "@/src/lib/langchain/chat";
import { ToolMessage } from "@langchain/core/messages";
import { groceryAgentTool } from "@/src/tools/supervisor/GroceryAgentTool";
import { orderAgentTool } from "@/src/tools/supervisor/OrderAgentTool";
import { expenseAgentTool } from "@/src/tools/supervisor/ExpenseAgentTool";
import {
  supervisorAgentFinalResponsePrompt,
  supervisorAgentPrompt,
} from "./prompts";
import { PendingProductGroup } from "@/src/lib/graph/state";

type SupervisorResult = {
  response: string;
  pendingOptions: PendingProductGroup[];
};

export class SupervisorAgent {
  async run(
    userMessage: string,
    pendingOptions: PendingProductGroup[] = [],
  ): Promise<SupervisorResult> {
    const modelWithAgents = llm.bindTools([
      groceryAgentTool,
      orderAgentTool,
      expenseAgentTool,
    ]);

    const response: any = await modelWithAgents.invoke([
      {
        role: "system",
        content: supervisorAgentPrompt,
      },
      {
        role: "user",
        content: userMessage,
      },
    ]);

    console.log("SUPERVISOR TOOL CALLS:", response.tool_calls);

    let updatedPendingOptions = pendingOptions;

    console.log("pending op", pendingOptions);

    if (!response.tool_calls?.length) {
      return {
        response: JSON.stringify(response.content ?? ""),
        pendingOptions: updatedPendingOptions,
      };
    }

    const toolMessages: ToolMessage[] = [];

    for (const toolCall of response.tool_calls) {
      let toolResult: any;

      if (toolCall.name === "grocery_agent") {
        toolResult = await groceryAgentTool.invoke({
          ...toolCall.args,
          pendingOptions,
        });

        console.log("Grocery Agent result:", toolResult);

        if (toolResult?.pendingOptions) {
          updatedPendingOptions = toolResult.pendingOptions;
        }

        toolMessages.push(
          new ToolMessage({
            content: JSON.stringify(toolResult?.lastResponse ?? ""),
            tool_call_id: toolCall.id,
          }),
        );

        continue;
      }

      if (toolCall.name === "order_agent") {
        toolResult = await orderAgentTool.invoke(toolCall.args);
      } else if (toolCall.name === "expense_agent") {
        toolResult = await expenseAgentTool.invoke(toolCall.args);
      }

      if (toolResult !== undefined) {
        toolMessages.push(
          new ToolMessage({
            content:
              typeof toolResult === "string"
                ? toolResult
                : JSON.stringify(toolResult),
            tool_call_id: toolCall.id,
          }),
        );
      }
    }

    const finalResponse = await modelWithAgents.invoke([
      {
        role: "system",
        content: supervisorAgentFinalResponsePrompt,
      },
      {
        role: "user",
        content: userMessage,
      },
      response,
      ...toolMessages,
    ]);

    return {
      response: String(finalResponse.content ?? ""),
      pendingOptions: updatedPendingOptions,
    };
  }
}
