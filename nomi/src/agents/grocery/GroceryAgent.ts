import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { GroceryMCPClient } from "../../mcp/grocery/GroceryMCPClient";
import { llm } from "@/src/lib/langchain/chat";
import { groceryAgentFinalResponsePrompt, groceryAgentPrompt } from "./prompts";
import { createSearchProductsTool } from "../../tools/grocery/searchProductsTool";
import { createAddProductTool } from "@/src/tools/grocery/addProductTool";
import { createDisplayCartTool } from "@/src/tools/grocery/displayCartTool";
import { createUpdateCartQuantityTool } from "@/src/tools/grocery/updateCartQuantityTool";
import { createAdjustCartQuantityTool } from "@/src/tools/grocery/adjustCartQuantityTool";
import { createRemoveFromCartTool } from "@/src/tools/grocery/removeFromCartTool";

const MAX_TOOL_ITERATIONS = 8;

const CART_MODIFICATION_TOOLS = [
  "update_cart_quantity",
  "adjust_cart_quantity",
  "remove_from_cart",
];

function getTextContent(content: any): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter(
        (block: any) => block.type === "text" && typeof block.text === "string",
      )
      .map((block: any) => block.text)
      .join("\n");
  }

  return "";
}

export class GroceryAgent {
  private groceryClient: GroceryMCPClient;

  constructor() {
    this.groceryClient = new GroceryMCPClient();
  }

  async connect() {
    await this.groceryClient.connect();
  }

  async disconnect() {
    await this.groceryClient.disconnect();
  }

  async run(userMessage: string, pendingOptions: any[] = []) {
    const searchProductsTool = createSearchProductsTool(this.groceryClient);
    const addProductTool = createAddProductTool(this.groceryClient);
    const displayCartTool = createDisplayCartTool(this.groceryClient);
    const updateCartQuantityTool = createUpdateCartQuantityTool(
      this.groceryClient,
    );
    const adjustCartQuantityTool = createAdjustCartQuantityTool(
      this.groceryClient,
    );
    const removeFromCartTool = createRemoveFromCartTool(this.groceryClient);

    const tools = [
      searchProductsTool,
      addProductTool,
      displayCartTool,
      updateCartQuantityTool,
      adjustCartQuantityTool,
      removeFromCartTool,
    ];

    const toolMap = new Map(
      tools.map((registeredTool) => [registeredTool.name, registeredTool]),
    );

    const modelWithTools = llm.bindTools(tools);

    const contextMessage = `
Previously retrieved product options:

${JSON.stringify(pendingOptions, null, 2)}

Rules:
- Reuse previous product options when the user's selection is clear.
- Never invent product IDs.
- productId identifies a catalog product.
- cartItemId identifies an existing cart entry.
- Never confuse these IDs.
- Always retrieve the latest cart before modifying an existing cart item.
`;

    const messages: any[] = [
      new SystemMessage(groceryAgentPrompt),
      new SystemMessage(contextMessage),
      new HumanMessage(userMessage),
    ];

    let updatedPendingOptions = [...pendingOptions];

    let cartFetchedThisRun = false;

    const executionHistory: string[] = [];

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      console.log(`Grocery Agent iteration: ${iteration + 1}`);

      const response: any = await modelWithTools.invoke(messages);

      messages.push(response);

      console.log("Nova response:", response.content);
      console.log("Nova tool calls:", response.tool_calls);

      if (!response.tool_calls?.length) {
        console.log("Grocery Agent finished without more tool calls.");

        const finalText = getTextContent(response.content)
          .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
          .trim();

        return {
          response: finalText,
          pendingOptions: updatedPendingOptions,
        };
      }

      const cartWasFetchedBeforeBatch = cartFetchedThisRun;

      for (const toolCall of response.tool_calls) {
        const toolName = toolCall.name;
        const toolArgs = toolCall.args;

        console.log("Executing tool:", toolName, toolArgs);

        const isCartModification = CART_MODIFICATION_TOOLS.includes(toolName);

        if (isCartModification && !cartWasFetchedBeforeBatch) {
          const deferredResult = {
            success: false,
            error:
              "Operation not executed. First call display_cart, inspect the returned cart, identify the correct cartItemId, and then retry this operation in a subsequent iteration.",
          };

          executionHistory.push(
            `${toolName}: Deferred. A fresh cart must be retrieved and inspected first.`,
          );

          messages.push(
            new ToolMessage({
              content: JSON.stringify(deferredResult),
              tool_call_id: toolCall.id,
            }),
          );

          continue;
        }

        const selectedTool: any = toolMap.get(toolName);

        if (!selectedTool) {
          const errorResult = {
            success: false,
            error: `Unknown grocery tool: ${toolName}`,
          };

          executionHistory.push(`${toolName}: Failed - unknown tool.`);

          messages.push(
            new ToolMessage({
              content: JSON.stringify(errorResult),
              tool_call_id: toolCall.id,
            }),
          );

          continue;
        }

        try {
          const result: any = await selectedTool.invoke(toolArgs);

          const resultText =
            typeof result === "string" ? result : JSON.stringify(result);

          let parsedResult: any = null;

          try {
            parsedResult = JSON.parse(resultText);
          } catch {
            parsedResult = null;
          }

          console.log(`${toolName} result:`, parsedResult ?? resultText);

          if (toolName === "search_products") {
            let products = parsedResult;

            if (!Array.isArray(products)) {
              products = products?.products ?? [];
            }

            const nextItemIndex =
              updatedPendingOptions.length > 0
                ? Math.max(
                    ...updatedPendingOptions.map(
                      (group: any) => group.itemIndex ?? -1,
                    ),
                  ) + 1
                : 0;

            const newGroup = {
              itemIndex: nextItemIndex,
              itemHint: toolArgs.itemHint,
              quantity: toolArgs.quantity ?? 1,
              products,
            };

            updatedPendingOptions = [...updatedPendingOptions, newGroup];
          }

          if (toolName === "add_to_cart" && parsedResult?.success) {
            const productId = Number(toolArgs.productId);

            const matchingGroupIndex = updatedPendingOptions.findIndex(
              (group: any) =>
                group.products?.some(
                  (product: any) => Number(product.id) === productId,
                ),
            );

            if (matchingGroupIndex !== -1) {
              updatedPendingOptions = updatedPendingOptions.filter(
                (_group, index) => index !== matchingGroupIndex,
              );
            }
          }

          if (toolName === "display_cart") {
            const cartFetchSucceeded =
              parsedResult !== null &&
              !parsedResult?.error &&
              parsedResult?.success !== false;

            if (cartFetchSucceeded) {
              cartFetchedThisRun = true;
            }
          }

          executionHistory.push(`${toolName}: ${resultText}`);

          messages.push(
            new ToolMessage({
              content: resultText,
              tool_call_id: toolCall.id,
            }),
          );
        } catch (error: any) {
          console.error(`Error executing ${toolName}:`, error);

          const errorResult = {
            success: false,
            error:
              error?.message ??
              "An unexpected error occurred while executing the tool.",
          };

          executionHistory.push(`${toolName}: Failed - ${errorResult.error}`);

          messages.push(
            new ToolMessage({
              content: JSON.stringify(errorResult),
              tool_call_id: toolCall.id,
            }),
          );
        }
      }
    }

    console.warn("Grocery Agent reached maximum tool iterations.");

    const executionSummary =
      executionHistory.length > 0
        ? executionHistory.join("\n\n")
        : "No tools were executed.";

    const fallbackResponse = await llm.invoke([
      new SystemMessage(`
${groceryAgentFinalResponsePrompt}

IMPORTANT:
- The maximum number of tool-calling iterations has been reached.
- Do not request any additional tool operations.
- Do not claim that an operation succeeded unless the execution summary confirms it.
- Explain any incomplete operation clearly.
- Respond only to the user in natural language.
`),
      new HumanMessage(`
Original user request:
${userMessage}

Tool execution history:
${executionSummary}

Do not perform additional operations. Summarize the actual results.
`),
    ]);

    return {
      response: getTextContent(fallbackResponse.content)
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
        .trim(),
      pendingOptions: updatedPendingOptions,
    };
  }
}
