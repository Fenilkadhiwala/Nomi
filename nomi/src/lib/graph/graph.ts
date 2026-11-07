import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { builder } from "./builder";

let compiledGraphPromise: Promise<ReturnType<typeof builder.compile>> | null =
  null;

export function getCompiledGraph() {
  if (!compiledGraphPromise) {
    compiledGraphPromise = (async () => {
      const checkpointer = PostgresSaver.fromConnString(
        process.env.DATABASE_URL!,
      );

      await checkpointer.setup();

      return builder.compile({
        checkpointer,
      });
    })().catch((error) => {
      compiledGraphPromise = null;
      throw error;
    });
  }

  return compiledGraphPromise;
}
