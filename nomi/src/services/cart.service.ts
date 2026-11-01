import {
  addToCart as addToCartRepository,
  displayCartRepository,
  getActiveCartByHousehold,
} from "../repositories/cart.repository";

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
  console.log("cart", cart);

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
