import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { searchProducts } from "../../services/product.service";
import { addToCart, displayCart } from "@/src/services/cart.service";
export const groceryMCPServer = new McpServer({
  name: "nomi-grocery",
  version: "1.0.0",
});

groceryMCPServer.registerTool(
  "display_cart",
  {
    title: "View Grocery Cart",
    description:
      "Retrieve all items in the active household grocery cart, including product details, quantities, prices, and the cart subtotal. Use this when the user asks to view, show, or list their grocery cart.",
    inputSchema: z.object({}),
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    try {
      // Replace this with trusted application context.
      const householdId = 1;

      const cart = await displayCart(householdId);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(cart),
          },
        ],
      };
    } catch (error) {
      console.error("get_cart failed:", error);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "Failed to retrieve the grocery cart",
            }),
          },
        ],
        isError: true,
      };
    }
  },
);

groceryMCPServer.registerTool(
  "add_to_cart",
  {
    title: "Add Item to Cart",
    description:
      "Add a selected product to the fv  active household grocery cart. Requires the product ID and quantity.",
    inputSchema: z.object({
      productId: z.number().int().positive(),
      quantity: z.number().int().positive(),
    }),
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ productId, quantity }) => {
    try {
      // TODO: Obtain householdId and userId from trusted application context.
      // Do not hardcode these values in production.

      const householdId: any = /* trusted household context */ 1;
      const userId = /* authenticated user context */ 1;

      if (householdId === undefined || userId === undefined) {
        throw new Error("Household and user context are required");
      }

      const cartItem = await addToCart(
        householdId,
        productId,
        quantity,
        userId,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "Item added to cart successfully",
              cartItem,
            }),
          },
        ],
      };
    } catch (error) {
      console.error("add_to_cart failed:", error);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to add item to cart",
            }),
          },
        ],
        isError: true,
      };
    }
  },
);

groceryMCPServer.registerTool(
  "search_products",
  {
    title: "Search Products",
    description:
      "Search the Nomi grocery catalog for products matching a grocery item.",
    inputSchema: z.object({
      itemHint: z.string().min(1).describe("The grocery item to search for"),
    }),
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ itemHint }) => {
    try {
      const products = await searchProducts(itemHint);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(products),
          },
        ],
      };
    } catch (error) {
      console.error("search_products failed:", error);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "Failed to search products",
            }),
          },
        ],
        isError: true,
      };
    }
  },
);
