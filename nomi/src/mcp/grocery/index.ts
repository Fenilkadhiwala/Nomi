import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { groceryMCPServer } from "./GroceryMCPServer";

async function main() {
  const transport = new StdioServerTransport();

  await groceryMCPServer.connect(transport);
}

main().catch((error) => {
  console.error("Grocery MCP server failed:", error);
  process.exit(1);
});
