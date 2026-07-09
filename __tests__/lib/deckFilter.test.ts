/**
 * lib/deckFilter.ts — fetchAllCatalogRows pagination.
 *
 * The old single `.limit(2000)` with no ORDER BY silently excluded ~600 of a 2,600+ recipe
 * catalog from every deck and every plan (stable Postgres scan order = same recipes forever).
 * This proves the paginated replacement: deterministic `id` ordering, ranges covering the
 * whole table, short-page termination, and the runaway backstop.
 */
import {
  fetchAllCatalogRows,
  CATALOG_PAGE_SIZE,
  CATALOG_MAX_PAGES,
} from '@/lib/deckFilter';

// Minimal transport mock: records each .range(from,to) and returns a slice of a fake table.
function makeClient(totalRows: number, opts: { error?: any } = {}) {
  const ranges: [number, number][] = [];
  const orderCols: string[] = [];
  const allRows = Array.from({ length: totalRows }, (_, i) => ({ id: `id-${String(i).padStart(5, '0')}` }));
  const client = {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        or: (_f: string) => ({
          is: (_c: string, _v: null) => ({
            order: (col: string, _o: { ascending: boolean }) => {
              orderCols.push(col);
              return {
                range: (from: number, to: number) => {
                  ranges.push([from, to]);
                  if (opts.error) return Promise.resolve({ data: null, error: opts.error });
                  return Promise.resolve({ data: allRows.slice(from, to + 1), error: null });
                },
              };
            },
          }),
        }),
      }),
    }),
  };
  return { client, ranges, orderCols };
}

describe('fetchAllCatalogRows', () => {
  it('pages through the whole catalog and returns every row once', async () => {
    const total = CATALOG_PAGE_SIZE * 2 + 619; // e.g. 2619 with a 1000 page size
    const { client, ranges } = makeClient(total);
    const rows = await fetchAllCatalogRows(client as any);
    expect(rows).toHaveLength(total);
    expect(new Set(rows.map((r) => r.id)).size).toBe(total); // no dupes, no gaps
    // 3 pages: [0,999], [1000,1999], [2000,2999] — the last is short so it terminates.
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('terminates on the first short page (exact multiple of the page size needs one extra probe)', async () => {
    const { client, ranges } = makeClient(CATALOG_PAGE_SIZE); // exactly one full page
    const rows = await fetchAllCatalogRows(client as any);
    expect(rows).toHaveLength(CATALOG_PAGE_SIZE);
    // First page is full → must probe once more; the 2nd page is empty (short) → stop.
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
  });

  it('handles an empty catalog in a single page', async () => {
    const { client, ranges } = makeClient(0);
    const rows = await fetchAllCatalogRows(client as any);
    expect(rows).toHaveLength(0);
    expect(ranges).toEqual([[0, 999]]);
  });

  it('orders by id ascending so the window is deterministic (not scan order)', async () => {
    const { client, orderCols } = makeClient(10);
    await fetchAllCatalogRows(client as any);
    expect(orderCols).toContain('id');
  });

  it('never exceeds the runaway backstop of CATALOG_MAX_PAGES', async () => {
    // A catalog larger than the backstop can cover — proves we cap rather than loop forever.
    const { client, ranges } = makeClient(CATALOG_PAGE_SIZE * (CATALOG_MAX_PAGES + 5));
    const rows = await fetchAllCatalogRows(client as any);
    expect(ranges.length).toBe(CATALOG_MAX_PAGES);
    expect(rows).toHaveLength(CATALOG_PAGE_SIZE * CATALOG_MAX_PAGES);
  });

  it('throws on a query error rather than silently returning a partial catalog', async () => {
    const { client } = makeClient(100, { error: { message: 'boom' } });
    await expect(fetchAllCatalogRows(client as any)).rejects.toBeTruthy();
  });
});
