import { llm } from "../../langchain/chat";
import { targetClassifierPrompt } from "../prompts";
import { targetClassificationSchema } from "../schemas";
import { State } from "../state";

const targetStructuredLlm = llm.withStructuredOutput(
  targetClassificationSchema,
  {
    name: "classify_target",
  },
);

const targetClassifierChain = targetClassifierPrompt.pipe(targetStructuredLlm);

export async function targetClassifierNode(
  state: State,
): Promise<Partial<State>> {
  const result = await targetClassifierChain.invoke({
    message: state.message,
  });

  console.log("target result", result);

  return {
    target: result.target,
    lastResponse: "",
  };
}
