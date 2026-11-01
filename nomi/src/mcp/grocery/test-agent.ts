import { GroceryAgent } from "@/src/agents/grocery/GroceryAgent";

async function main() {
  const agent = new GroceryAgent();

  try {
    console.log("Starting Grocery Agent...");

    await agent.connect();

    console.log("Grocery Agent connected.");

    const response = await agent.run(
      "I need milk. Can you show me some options?",
    );

    console.log("\nAgent response:");
    console.log(response);
  } catch (error) {
    console.error("Grocery Agent failed:", error);
  } finally {
    await agent.disconnect();
  }
}

main();
