import { pool } from "../lib/db/pool";

export type ProductSearchRow = {
  id: number;
  name: string;
  brand: string | null;
  category: string;
  pack_size: string | null;
  price_cents: number;
  image_url: string | null;
  keywords: string[];
  search_text: string | null;
  score: number;
};

export async function searchProducts(
  itemHint: string,
): Promise<ProductSearchRow[]> {
  const normalizedItem = itemHint.trim().toLowerCase();

  if (!normalizedItem) {
    return [];
  }

  const { rows } = await pool.query<ProductSearchRow>(
    `
      SELECT
        id,
        name,
        brand,
        category,
        pack_size,
        price_cents,
        image_url,
        keywords,
        search_text,
        similarity(search_text, $1) AS score
      FROM products
      WHERE $1 = ANY(keywords)
         OR similarity(search_text, $1) > 0.2
      ORDER BY score DESC
      LIMIT 5
    `,
    [normalizedItem],
  );

  return rows;
}
