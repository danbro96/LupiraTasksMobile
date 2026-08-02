import { describe, it, expect, vi } from 'vitest';
import { createFakeDb, type FakeSqliteDb } from '../test/fakeExpoSqlite';
import { emptyItemState, type ItemState } from '../domain/itemState';

// db.ts runs against a real in-memory SQLite (node:sqlite) behind the expo-sqlite surface, so
// schema, transactions, and constraints behave exactly as on device. Each test re-imports the
// module (getDb memoizes a connection and withWriteTxn chains module state).

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => holder.db }));
vi.mock('../debug/log', () => ({ logDebug: vi.fn() }));

type DbModule = typeof import('./db');

async function freshDb(seed?: FakeSqliteDb): Promise<DbModule> {
  vi.resetModules();
  holder.db = seed ?? createFakeDb();
  return import('./db');
}

const fakeDb = () => holder.db as FakeSqliteDb;

function mkItem(id: string, over: Partial<ItemState> = {}): ItemState {
  return { ...emptyItemState(), id, listId: 'L1', sortOrder: id, updatedAt: '2026-01-01T00:00:00.000Z', ...over };
}

describe('init / migration', () => {
  it('creates the schema and stamps user_version', async () => {
    const m = await freshDb();
    const db = await m.getDb();
    const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(v?.user_version).toBe(2);
    expect(await m.getListIds(db)).toEqual([]);
  });

  it('getDb memoizes a single connection', async () => {
    const m = await freshDb();
    expect(await m.getDb()).toBe(await m.getDb());
  });

  it('wipes every table when user_version is below SCHEMA_VERSION', async () => {
    const seed = createFakeDb();
    // A pre-v2 install: old-shape table, populated, user_version 0 (never stamped).
    await seed.execAsync(`
      CREATE TABLE lists (id TEXT PRIMARY KEY NOT NULL, doc_json TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
      INSERT INTO lists (id, doc_json) VALUES ('stale', '{}');
    `);
    const m = await freshDb(seed);
    const db = await m.getDb();
    expect(await m.getListIds(db)).toEqual([]);
    const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(v?.user_version).toBe(2);
  });
});

describe('withWriteTxn', () => {
  it('serializes overlapping transactions so both commit', async () => {
    const m = await freshDb();
    const db = await m.getDb();
    const a = m.withWriteTxn(async tx => {
      await m.putItemState(tx, mkItem('A'));
      await new Promise(r => setTimeout(r, 5)); // hold the txn open across awaits
      await m.putItemState(tx, mkItem('B'));
    });
    const b = m.withWriteTxn(async tx => {
      await m.putItemState(tx, mkItem('C'));
    });
    await Promise.all([a, b]);
    expect((await m.getItemsByList(db, 'L1')).map(i => i.id).sort()).toEqual(['A', 'B', 'C']);
  });

  it('control: raw overlapping withTransactionAsync throws (the hazard the mutex removes)', async () => {
    const fake = createFakeDb();
    const slow = fake.withTransactionAsync(async () => {
      await new Promise(r => setTimeout(r, 10));
    });
    const fast = fake.withTransactionAsync(async () => {});
    await expect(Promise.all([slow, fast])).rejects.toThrow();
  });

  it('a failed transaction rolls back and does not poison the chain', async () => {
    const m = await freshDb();
    const db = await m.getDb();
    await expect(
      m.withWriteTxn(async tx => {
        await m.putItemState(tx, mkItem('A'));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await m.getItemState(db, 'A')).toBeNull(); // rolled back
    await m.withWriteTxn(async tx => {
      await m.putItemState(tx, mkItem('B'));
    });
    expect(await m.getItemState(db, 'B')).not.toBeNull(); // gate still live
  });
});

// Every statement passes through one gate, so the app never has two expo-sqlite calls in flight.
// That is both a correctness property (no read observes a half-applied transaction) and the
// mitigation for expo-modules-core's unsynchronized shared-object registry.
describe('serialization gate', () => {
  it('never runs two statements at once across reads, writes and a transaction', async () => {
    const m = await freshDb();
    const db = await m.getDb();
    fakeDb().maxInFlight = 0; // discard the schema init

    await Promise.all([
      m.withWriteTxn(async tx => {
        await m.putItemState(tx, mkItem('A'));
        await new Promise(r => setTimeout(r, 5)); // hold the txn open across awaits
        await m.putItemState(tx, mkItem('B'));
      }),
      m.getItemsByList(db, 'L1'),
      m.getListIds(db),
      m.pendingCount(db),
      m.putItemState(db, mkItem('C')),
    ]);

    expect(fakeDb().maxInFlight).toBe(1);
  });

  it('a read issued after a transaction starts sees the committed state, never a partial one', async () => {
    const m = await freshDb();
    const db = await m.getDb();
    const txn = m.withWriteTxn(async tx => {
      await m.putItemState(tx, mkItem('A'));
      await new Promise(r => setTimeout(r, 5));
      await m.putItemState(tx, mkItem('B'));
    });
    const read = m.getItemsByList(db, 'L1');
    const [, rows] = await Promise.all([txn, read]);
    expect(rows.map(i => i.id)).toEqual(['A', 'B']); // ['A'] would be a mid-transaction read
  });
});

// expo-modules-core reads its SharedObjectRegistry map without the lock it writes under, so a
// freshly-created NativeStatement can spuriously report as released. The lookup fails before any
// SQL runs, so re-issuing is safe and gets a fresh registry id.
describe('released-shared-object retry', () => {
  const releasedError = () => new Error(
    "Call to function 'NativeDatabase.prepareAsync' has been rejected.\n" +
    '→ Caused by: The 2nd argument cannot be cast to type class expo.modules.sqlite.NativeStatement (received class java.lang.Integer)\n' +
    '→ Caused by: Cannot use shared object that was already released',
  );

  it('retries the statement once and succeeds', async () => {
    const m = await freshDb();
    const db = await m.getDb();
    await m.putItemState(db, mkItem('A'));

    fakeDb().failNext('getAllAsync', releasedError());
    expect((await m.getItemsByList(db, 'L1')).map(i => i.id)).toEqual(['A']);
  });

  it('finds the cause nested under a wrapper error', async () => {
    const m = await freshDb();
    const db = await m.getDb();
    fakeDb().failNext('getAllAsync', new Error('wrapped', { cause: releasedError() }));
    expect(await m.getListIds(db)).toEqual([]);
  });

  it('propagates any other error untouched', async () => {
    const m = await freshDb();
    const db = await m.getDb();
    fakeDb().failNext('getAllAsync', new Error('disk I/O error'));
    await expect(m.getItemsByList(db, 'L1')).rejects.toThrow('disk I/O error');
  });
});

describe('deleteItemsNotIn', () => {
  it('removes the list rows absent from the keep set, other lists untouched', async () => {
    const m = await freshDb();
    const db = await m.getDb();
    for (const id of ['A', 'B', 'C']) await m.putItemState(db, mkItem(id));
    await m.putItemState(db, mkItem('X', { listId: 'L2' }));
    await m.deleteItemsNotIn(db, 'L1', ['A']);
    expect((await m.getItemsByList(db, 'L1')).map(i => i.id)).toEqual(['A']);
    expect((await m.getItemsByList(db, 'L2')).map(i => i.id)).toEqual(['X']);
  });

  it('an empty keep set clears the list', async () => {
    const m = await freshDb();
    const db = await m.getDb();
    await m.putItemState(db, mkItem('A'));
    await m.deleteItemsNotIn(db, 'L1', []);
    expect(await m.getItemsByList(db, 'L1')).toEqual([]);
  });
});

describe('adoptDbOwner', () => {
  async function seedData(m: DbModule) {
    const db = await m.getDb();
    await m.putListDoc(db, { id: 'L1', archived: false, updatedAt: 't', doc: { id: 'L1' } });
    await m.putItemState(db, mkItem('A'));
    await m.insertOutbox(db, 'c1', '{"listId":"L1"}', 't');
    return db;
  }

  it('stamps an unowned DB without wiping (pre-stamping installs, same-user relogin)', async () => {
    const m = await freshDb();
    const db = await seedData(m);
    await m.adoptDbOwner('a@example.com');
    expect(await m.getListIds(db)).toEqual(['L1']);
    expect(await m.pendingCount(db)).toBe(1);
  });

  it('is a no-op for the same owner (token rotation, relogin)', async () => {
    const m = await freshDb();
    const db = await seedData(m);
    await m.adoptDbOwner('a@example.com');
    await m.adoptDbOwner('a@example.com');
    expect(await m.getListIds(db)).toEqual(['L1']);
    expect(await m.pendingCount(db)).toBe(1);
  });

  it('wipes mirror + outbox when a different account signs in', async () => {
    const m = await freshDb();
    const db = await seedData(m);
    await m.adoptDbOwner('a@example.com');
    await m.adoptDbOwner('b@example.com');
    expect(await m.getListIds(db)).toEqual([]);
    expect(await m.getItemState(db, 'A')).toBeNull();
    expect(await m.pendingCount(db)).toBe(0);
    // Re-adopting the new owner is now a no-op.
    await m.putItemState(db, mkItem('B'));
    await m.adoptDbOwner('b@example.com');
    expect(await m.getItemState(db, 'B')).not.toBeNull();
  });
});
