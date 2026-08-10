import { describe, expect, it } from 'vitest';
import { SupabaseSyncBackend } from '../supabaseSyncBackend';
import type { SupabaseClient } from '@supabase/supabase-js';

interface RecordedQuery {
  table: string;
  gte: string;
  order: Array<{ column: string; ascending: boolean }>;
  range: { from: number; to: number };
}

/**
 * Just enough of the PostgREST builder to observe how `pull` asks for rows.
 * Each table is handed a list of rows and serves them a page at a time, the
 * way the real endpoint does under its row cap.
 */
function fakeClient(rowsByTable: Record<string, unknown[]>) {
  const queries: RecordedQuery[] = [];

  const client = {
    from(table: string) {
      const query: RecordedQuery = {
        table,
        gte: '',
        order: [],
        range: { from: 0, to: 0 },
      };

      const builder = {
        select: () => builder,
        eq: () => builder,
        gte(_column: string, value: string) {
          query.gte = value;
          return builder;
        },
        order(column: string, options: { ascending: boolean }) {
          query.order.push({ column, ascending: options.ascending });
          return builder;
        },
        range(from: number, to: number) {
          query.range = { from, to };
          queries.push(query);
          const all = rowsByTable[table] ?? [];
          return Promise.resolve({ data: all.slice(from, to + 1), error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;

  return { client, queries };
}

function deckRows(count: number, startMs = 0): unknown[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `deck_${String(index).padStart(5, '0')}`,
    updated_at: new Date(startMs + index * 1000).toISOString(),
    deleted_at: null,
    data: { id: `deck_${index}` },
  }));
}

describe('SupabaseSyncBackend.pull', () => {
  /**
   * The bug this guards: PostgREST truncates at its row cap without saying so,
   * and the engine then moves its cursor past rows it never received. A user
   * with a large library lost the remainder permanently on a new device.
   */
  it('pages past the row cap instead of returning a truncated first page', async () => {
    const { client } = fakeClient({ decks: deckRows(1_250), cards: [], study_sessions: [] });

    const changes = await new SupabaseSyncBackend(client).pull('user-1', null);

    expect(changes.decks).toHaveLength(1_250);
  });

  it('walks consecutive, non-overlapping ranges', async () => {
    const { client, queries } = fakeClient({ decks: deckRows(1_250), cards: [], study_sessions: [] });

    await new SupabaseSyncBackend(client).pull('user-1', null);

    const deckRanges = queries.filter((q) => q.table === 'decks').map((q) => q.range);
    expect(deckRanges).toEqual([
      { from: 0, to: 499 },
      { from: 500, to: 999 },
      { from: 1000, to: 1499 },
    ]);
  });

  it('stops after one request when the first page is short', async () => {
    const { client, queries } = fakeClient({ decks: deckRows(12), cards: [], study_sessions: [] });

    await new SupabaseSyncBackend(client).pull('user-1', null);

    expect(queries.filter((q) => q.table === 'decks')).toHaveLength(1);
  });

  /**
   * Ascending order is what makes the cursor safe: anything a page did not
   * reach is necessarily newer than the newest row that came back, so the
   * cursor can never step over it. The id tiebreak keeps paging stable when
   * rows share a timestamp.
   */
  it('orders by updated_at ascending, with id breaking ties', async () => {
    const { client, queries } = fakeClient({ decks: deckRows(3), cards: [], study_sessions: [] });

    await new SupabaseSyncBackend(client).pull('user-1', null);

    expect(queries[0]?.order).toEqual([
      { column: 'updated_at', ascending: true },
      { column: 'id', ascending: true },
    ]);
  });

  it('reads from the epoch on a first pull', async () => {
    const { client, queries } = fakeClient({ decks: [], cards: [], study_sessions: [] });

    await new SupabaseSyncBackend(client).pull('user-1', null);

    expect(queries[0]?.gte).toBe(new Date(0).toISOString());
  });

  /**
   * Inclusive, not exclusive: a row committed at the boundary of the previous
   * pull may not have been visible then. Re-reading it merges to a no-op.
   */
  it('includes the cursor instant itself', async () => {
    const { client, queries } = fakeClient({ decks: [], cards: [], study_sessions: [] });
    const since = '2026-03-01T12:00:00.000Z';

    await new SupabaseSyncBackend(client).pull('user-1', since);

    expect(queries.every((query) => query.gte === since)).toBe(true);
  });

  it('reads all three tables', async () => {
    const { client, queries } = fakeClient({ decks: [], cards: [], study_sessions: [] });

    await new SupabaseSyncBackend(client).pull('user-1', null);

    expect(queries.map((query) => query.table).sort()).toEqual(['cards', 'decks', 'study_sessions']);
  });
});
