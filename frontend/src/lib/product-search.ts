// Search a fully loaded Staff catalogue without an API/database request.
export function matchesProductSearch(product: { name: string }, search: string): boolean {
  return product.name.toLowerCase().includes(search.trim().toLowerCase());
}
