/** Dashboard pages remain bounded even when a sync removes decks. */
export function dashboardDeckPage<T>(items: readonly T[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / 4));
  const page = Math.max(0, Math.min(requestedPage, pageCount - 1));
  return { items: items.slice(page * 4, page * 4 + 4), page, pageCount };
}
