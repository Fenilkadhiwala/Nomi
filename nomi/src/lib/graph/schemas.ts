import z from "zod";

export const targetClassificationSchema = z.object({
  target: z.enum(["agent", "household"]),
});

export const messageClassificationSchema = z.object({
  intent: z.enum([
    "add_item",
    "select_option",
    "remove_item",
    "change_quantity",
    "ready_confirmation",
    "cancel_confirmation",
    "view_cart_request",
    "expense_request",
    "greeting",
    "products_inquiry",
    "other",
  ]),
  url: z.string().nullable(),
  itemHint: z.string().nullable(),
});

export const optionsSchema = z.object({
  quantity: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe(
      "The quantity the user wants, if mentioned (e.g. 'two breads' -> 2). Null if not mentioned — default to 1 in that case.",
    ),
});

export const removeItemSchema = z.object({
  itemIndices: z
    .array(z.number())
    .describe(
      "0-based indices into the current cart of the item(s) to remove. Can be multiple if the user's message clearly refers to more than one item. Empty array if nothing matches clearly.",
    ),
  removeEntirely: z
    .boolean()
    .describe(
      "True if the user wants the item(s) fully removed. False if they only want to reduce the quantity (in that case, check quantityToRemove).",
    ),
  quantityToRemove: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe(
      "If the user wants to remove a partial quantity (e.g. 'remove one of the kitkats'), the amount to subtract. Null if removing the item(s) entirely or not applicable.",
    ),
});

export const selectionSchema = z.object({
  selectedIndex: z
    .number()
    .nullable()
    .describe(
      "0-based index of the option the user is referring to, or null if none match clearly",
    ),
  quantity: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe(
      "The quantity the user wants, if mentioned (e.g. 'two breads' -> 2). Null if not mentioned — default to 1 in that case.",
    ),
});

export const changeQuantitySchema = z.object({
  itemIndex: z
    .number()
    .nullable()
    .describe(
      "0-based index into the current cart of the item the user is referring to. Null if it doesn't clearly match any cart item.",
    ),
  quantityDelta: z
    .number()
    .int()
    .positive()
    .describe(
      "The amount to increase or decrease by. If the user gives an absolute number ('make it 3'), calculate the difference from the item's current quantity. If not mentioned, default to 1.",
    ),
  type: z.enum(["increase", "decrease"]),
});
