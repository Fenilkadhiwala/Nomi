import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { builder } from "./builder";

export async function getCompiledGraph() {
  const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL!);
  await checkpointer.setup();
  return builder.compile({ checkpointer });
}
