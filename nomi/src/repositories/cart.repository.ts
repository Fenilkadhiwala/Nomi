import { pool } from "../lib/db/pool";

export type CartItemRow = {
  id: number;
  cart_id: number;
  product_id: number;
  quantity: number;
  added_by: number;
  created_at: Date;
  updated_at: Date;
};
export async function displayCartRepository(cartId: number) {
  const { rows } = await pool.query(
    `
      SELECT
        ci.id,
        ci.cart_id,
        ci.product_id,
        p.name,
        p.brand,
        p.category,
        p.pack_size,
        p.price_cents,
        p.image_url,
        ci.quantity,
        ci.added_by,
        ci.created_at,
        ci.updated_at
      FROM cart_items ci
      JOIN products p
        ON p.id = ci.product_id
      WHERE ci.cart_id = $1
      ORDER BY ci.created_at ASC
    `,
    [cartId],
  );

  return rows;
}
export async function addToCart(
  cartId: number,
  productId: number,
  quantity: number,
  addedBy: number,
): Promise<CartItemRow> {
  const { rows } = await pool.query<CartItemRow>(
    `
      INSERT INTO cart_items (
        cart_id,
        product_id,
        quantity,
        added_by
      )
      VALUES ($1, $2, $3, $4)

      ON CONFLICT (cart_id, product_id)
      DO UPDATE SET
        quantity = cart_items.quantity + EXCLUDED.quantity,
        updated_at = NOW()

      RETURNING
        id,
        cart_id,
        product_id,
        quantity,
        added_by,
        created_at,
        updated_at
    `,
    [cartId, productId, quantity, addedBy],
  );

  return rows[0];
}

export async function getActiveCartByHousehold(householdId: number) {
  const { rows } = await pool.query(
    `
      SELECT
        id,
        household_id,
        status,
        created_at,
        updated_at
      FROM carts
      WHERE household_id = $1
        AND status = 'active'
      LIMIT 1
    `,
    [householdId],
  );

  return rows[0] ?? null;
}
