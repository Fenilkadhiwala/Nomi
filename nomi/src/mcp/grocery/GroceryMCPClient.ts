import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

export class GroceryMCPClient {
  private client: Client;
  private transport: StdioClientTransport;

  constructor() {
    this.client = new Client({
      name: "nomi-grocery-client",
      version: "1.0.0",
    });

    this.transport = new StdioClientTransport({
      command: "tsx",
      args: ["src/mcp/grocery/index.ts"],
    });
  }

  async connect() {
    await this.client.connect(this.transport);
  }

  async updateCartQuantity(cartItemId: any, quantity: any) {
    const result = await this.client.callTool({
      name: "update_cart_quantity",
      arguments: {
        cartItemId,
        quantity,
      },
    });

    if (result.isError) {
      throw new Error("update_cart_quantity failed");
    }

    const textContent = result.content.find(
      (item: any) => item.type === "text",
    );

    if (!textContent || !("text" in textContent)) {
      throw new Error("Invalid search_products response");
    }

    return JSON.parse(textContent.text);
  }

  async adjustCartQuantity(cartItemId: any, quantity: any) {
    const result = await this.client.callTool({
      name: "adjust_cart_quantity",
      arguments: {
        cartItemId,
        quantity,
      },
    });

    if (result.isError) {
      throw new Error("adjust_cart_quantity failed");
    }

    const textContent = result.content.find(
      (item: any) => item.type === "text",
    );

    if (!textContent || !("text" in textContent)) {
      throw new Error("Invalid search_products response");
    }

    return JSON.parse(textContent.text);
  }

  async removeFromCart(cartItemId: any) {
    const result = await this.client.callTool({
      name: "remove_from_cart",
      arguments: {
        cartItemId,
      },
    });

    if (result.isError) {
      throw new Error("remove_from_cart failed");
    }

    const textContent = result.content.find(
      (item: any) => item.type === "text",
    );

    if (!textContent || !("text" in textContent)) {
      throw new Error("Invalid search_products response");
    }

    return JSON.parse(textContent.text);
  }

  async searchProducts(itemHint: string) {
    const result = await this.client.callTool({
      name: "search_products",
      arguments: {
        itemHint,
      },
    });

    if (result.isError) {
      throw new Error("search_products failed");
    }

    const textContent = result.content.find(
      (item: any) => item.type === "text",
    );

    if (!textContent || !("text" in textContent)) {
      throw new Error("Invalid search_products response");
    }

    return JSON.parse(textContent.text);
  }

  async displayCart() {
    const result = await this.client.callTool({
      name: "display_cart",
      arguments: {},
    });

    if (result.isError) {
      throw new Error("display_cart failed");
    }

    const textContent = result.content.find(
      (item: any) => item.type === "text",
    );

    if (!textContent || !("text" in textContent)) {
      throw new Error("Invalid display_cart response");
    }

    return JSON.parse(textContent.text);
  }

  async addToCart(productId: number, quantity: number) {
    const result = await this.client.callTool({
      name: "add_to_cart",
      arguments: {
        productId,
        quantity,
      },
    });

    if (result.isError) {
      throw new Error("add_to_cart failed");
    }

    const textContent = result.content.find(
      (item: any) => item.type === "text",
    );

    if (!textContent || !("text" in textContent)) {
      throw new Error("Invalid add_to_cart response");
    }

    return JSON.parse(textContent.text);
  }

  async disconnect() {
    await this.transport.close();
  }
}
