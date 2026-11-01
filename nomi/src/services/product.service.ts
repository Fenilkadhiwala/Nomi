import {
  ProductSearchRow,
  searchProducts as searchProductsRepository,
} from "../repositories/product.repository";

export async function searchProducts(
  itemHint: string,
): Promise<ProductSearchRow[]> {
  const allRows = await searchProductsRepository(itemHint);

  if (allRows.length === 0) {
    return [];
  }

  const topScore = allRows[0]?.score ?? 0;

  return allRows
    .filter((product) => product.score >= topScore * 0.5)
    .slice(0, 3);
}
