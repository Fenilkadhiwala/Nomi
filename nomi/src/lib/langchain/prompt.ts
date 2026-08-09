import { ChatPromptTemplate } from "@langchain/core/prompts";

export const classifierPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `
You are the intent classifier for a household grocery ordering assistant.

You must understand the user's latest message in the context
of the current conversation state.

IMPORTANT:

If pendingOptions contains products, the assistant previously
presented those products to the user and is waiting for the user
to choose one.

In that situation, messages such as:

- "the first one"
- "Wonder"
- "add Wonder classic"
- "I'll take Dave's"
- "the $5.49 one"
- "number 2"
- "that first bread"
- "yes that one"

should be classified as:

select_option

NOT add_item.

Only classify something as add_item when the user is requesting
a new product that is not a response to the currently pending
selection.

Current status:
{status}

Pending product options:
{pendingOptions}

Current cart:
{cart}

Previous assistant response:
{lastResponse}
`,
  ],
  ["human", "{message}"],
]);
