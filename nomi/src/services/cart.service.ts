import {
  addToCart as addToCartRepository,
  adjustCartItemQuantity,
  displayCartRepository,
  getActiveCartByHousehold,
  removeCartItem,
  updateCartItemQuantity,
} from "../repositories/cart.repository";

export async function updateCartQuantity(
  householdId: number,
  cartItemId: number,
  quantity: number,
) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Quantity must be a positive integer");
  }

  const cart = await getActiveCartByHousehold(householdId);

  if (!cart) {
    throw new Error("No active cart found for this household");
  }

  const updatedItem = await updateCartItemQuantity(
    cart.id,
    cartItemId,
    quantity,
  );

  if (!updatedItem) {
    throw new Error("Cart item not found in this household");
  }

  return updatedItem;
}

export async function adjustCartQuantity(
  householdId: number,
  cartItemId: number,
  quantityChange: number,
) {
  if (!Number.isInteger(quantityChange) || quantityChange === 0) {
    throw new Error("Quantity change must be a non-zero integer");
  }

  const cart = await getActiveCartByHousehold(householdId);

  if (!cart) {
    throw new Error("No active cart found for this household");
  }

  const updatedItem = await adjustCartItemQuantity(
    cart.id,
    cartItemId,
    quantityChange,
  );

  if (!updatedItem) {
    throw new Error(
      "Cart item not found or resulting quantity would be zero or negative",
    );
  }

  return updatedItem;
}
export async function removeFromCart(householdId: number, cartItemId: number) {
  const cart = await getActiveCartByHousehold(householdId);

  if (!cart) {
    throw new Error("No active cart found for this household");
  }

  const deletedItem = await removeCartItem(cart.id, cartItemId);

  if (!deletedItem) {
    throw new Error("Cart item not found in this household");
  }

  return {
    success: true,
    message: "Item removed from cart successfully",
    deletedItem,
  };
}

export async function addToCart(
  householdId: number,
  productId: number,
  quantity: number,
  addedBy: number,
) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Quantity must be a positive integer");
  }

  const cart = await getActiveCartByHousehold(householdId);

  if (!cart) {
    throw new Error("No active cart found for this household");
  }

  const cartItem = await addToCartRepository(
    cart.id,
    productId,
    quantity,
    addedBy,
  );

  return cartItem;
}

export async function displayCart(householdId: number) {
  if (!householdId) {
    throw new Error("Invalid Household ID");
  }

  const cart = await getActiveCartByHousehold(householdId);
  console.log("cart", cart);

  if (!cart) {
    throw new Error("No active cart found for this household");
  }

  const cartItem = await displayCartRepository(cart.id);

  return cartItem;
}
