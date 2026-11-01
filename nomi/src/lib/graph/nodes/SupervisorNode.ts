import { SupervisorAgent } from "@/src/agents/supervisor/supervisorAgent";
import { State } from "../state";

const supervisorAgent = new SupervisorAgent();

export async function supervisorNode(state: State) {
  const result = await supervisorAgent.run(state.message, state.pendingOptions);

  console.log("state", state);

  return {
    lastResponse: result.response,
    pendingOptions: result.pendingOptions,
  };
}
