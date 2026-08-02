import * as SQLite from 'expo-sqlite';
import type { ItemState } from '../domain/itemState';
import { rowsForList } from '../domain/outboxScope';
import { logDebug } from '../debug/log';

// One SQLite database holds the offline read-model mirror (lists + items as JSON docs)
// and the durable mutation outbox, so an optimistic apply + enqueue commit atomically.
// The mirror is what the UI reads offline; the outbox is replayed on reconnect.

const DB_NAME = 'lupira-tasks-offline.db';
// The mirror stores whole-object ListResponse/ItemState JSON, so a server contract change (v2:
// the email→principalId identity re-key) can't be migrated per-column — bumping this wipes every
// table and forces a clean re-pull. A bump destroys the outbox too: un-pushed local edits exist
// nowhere else and are lost. Bump only for genuinely incompatible persisted shapes; prefer
// additive CREATE TABLE IF NOT EXISTS migrations (like `meta` below).
const SCHEMA_VERSION = 2;

export type SqlParam = string | number | null;

/** The statement surface the data layer uses. Deliberately excludes `withTransactionAsync`:
 *  transactions go through `withWriteTxn` so nothing can bypass the serialization gate. */
export interface Sql {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SqlParam[]): Promise<unknown>;
  getFirstAsync<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
}

interface Handles {
  db: SQLite.SQLiteDatabase;
  /** Un-gated — only for code already holding the gate (a `withWriteTxn` body). */
  raw: Sql;
  queued: Sql;
}

let handles: Promise<Handles> | null = null;

function getHandles(): Promise<Handles> {
  if (!handles) handles = init();
  return handles;
}

export async function getDb(): Promise<Sql> {
  return (await getHandles()).queued;
}

// Every statement passes through this one gate, for two reasons.
//
// Correctness: expo-sqlite's withTransactionAsync is a bare BEGIN/task/COMMIT on the one shared
// connection — no JS mutex — so two overlapping transactions throw on the nested BEGIN, the
// loser's ROLLBACK destroys the winner's uncommitted writes, and an unrelated read can observe a
// half-applied transaction.
//
// Survival: expo-modules-core's SharedObjectRegistry reads its `pairs` map without holding the
// lock it writes under, so a NativeStatement registered on the JS thread can read as "already
// released" while the argument conversion runs on Dispatchers.IO. Keeping one statement in flight
// removes the concurrent registrations that make that race likely (see withRetry for the rest).
let gate: Promise<unknown> = Promise.resolve();

function queue<T>(fn: () => Promise<T>): Promise<T> {
  const run = gate.then(fn);
  gate = run.catch(() => {}); // a failed call must not poison the gate
  return run;
}

const RELEASED_SHARED_OBJECT = /already released/i;

function isReleasedSharedObject(e: unknown): boolean {
  for (let x: unknown = e, depth = 0; x instanceof Error && depth < 5; x = x.cause, depth++) {
    if (RELEASED_SHARED_OBJECT.test(x.message)) return true;
  }
  return false;
}

/**
 * Retry once past expo-modules-core's shared-object registry race. The lookup fails during
 * argument conversion, strictly before any SQL runs, so re-issuing is safe even mid-transaction,
 * and each call builds a fresh NativeStatement — the retry gets a new registry id.
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isReleasedSharedObject(e)) throw e;
    logDebug('db:retry', e instanceof Error ? e.message.split('\n')[0] : String(e));
  }
  return fn();
}

function facade(db: SQLite.SQLiteDatabase, wrap: <T>(fn: () => Promise<T>) => Promise<T>): Sql {
  return {
    execAsync: sql => wrap(() => db.execAsync(sql)),
    runAsync: (sql, params = []) => wrap(() => db.runAsync(sql, params)),
    getFirstAsync: <T,>(sql: string, params: SqlParam[] = []) => wrap(() => db.getFirstAsync<T>(sql, params)),
    getAllAsync: <T,>(sql: string, params: SqlParam[] = []) => wrap(() => db.getAllAsync<T>(sql, params)),
  };
}

/**
 * Run a multi-statement write as one transaction, holding the gate for its whole duration. The
 * body MUST use the `tx` handle it is given: the outer `getDb()` handle queues behind the gate
 * this transaction already owns, and would deadlock.
 */
export function withWriteTxn(fn: (tx: Sql) => Promise<void>): Promise<void> {
  // Enqueued synchronously, like the statement facades, so the gate stays FIFO by call order.
  return queue(async () => {
    const { db, raw } = await getHandles();
    await db.withTransactionAsync(() => fn(raw));
  });
}

async function init(): Promise<Handles> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  const raw = facade(db, withRetry);
  const queued = facade(db, fn => queue(() => withRetry(fn)));

  // Existing pre-v2 installs report user_version 0 (the old schema never set it), so they get
  // wiped here; on a fresh install the DROPs are harmless no-ops before the CREATEs below.
  const { user_version: version } = (await raw.getFirstAsync<{ user_version: number }>('PRAGMA user_version')) ?? { user_version: 0 };
  if (version < SCHEMA_VERSION) {
    await raw.execAsync(`
      DROP TABLE IF EXISTS lists;
      DROP TABLE IF EXISTS items;
      DROP TABLE IF EXISTS outbox;
      DROP TABLE IF EXISTS sync_state;
      DROP TABLE IF EXISTS meta;
    `);
  }
  // v2 databases created before columns/tables were retired keep them as harmless orphans
  // (lists.deleted, items.completed, sync_state — all defaulted or unreferenced).
  await raw.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA user_version = ${SCHEMA_VERSION};
    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY NOT NULL,
      doc_json TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY NOT NULL,
      list_id TEXT NOT NULL,
      state_json TEXT NOT NULL,
      sort_order TEXT NOT NULL DEFAULT '',
      deleted INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_items_list ON items (list_id);
    CREATE TABLE IF NOT EXISTS outbox (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      command_id TEXT NOT NULL UNIQUE,
      op_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox (status, seq);
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
  return { db, raw, queued };
}

export async function putItemState(db: Sql, s: ItemState): Promise<void> {
  await db.runAsync(
    `INSERT INTO items (id, list_id, state_json, sort_order, deleted, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       list_id = excluded.list_id, state_json = excluded.state_json,
       sort_order = excluded.sort_order, deleted = excluded.deleted, updated_at = excluded.updated_at`,
    [s.id, s.listId, JSON.stringify(s), s.sortOrder, s.deleted ? 1 : 0, s.updatedAt],
  );
}

export async function getItemState(db: Sql, id: string): Promise<ItemState | null> {
  const row = await db.getFirstAsync<{ state_json: string }>(`SELECT state_json FROM items WHERE id = ?`, [id]);
  return row ? (JSON.parse(row.state_json) as ItemState) : null;
}

export async function getItemsByList(db: Sql, listId: string): Promise<ItemState[]> {
  const rows = await db.getAllAsync<{ state_json: string }>(
    `SELECT state_json FROM items WHERE list_id = ? AND deleted = 0 ORDER BY sort_order ASC`,
    [listId],
  );
  return rows.map(r => JSON.parse(r.state_json) as ItemState);
}

/** Hard-delete a list's item rows absent from the server payload (server-side deletions). */
export async function deleteItemsNotIn(db: Sql, listId: string, keepIds: string[]): Promise<void> {
  if (keepIds.length === 0) {
    await db.runAsync(`DELETE FROM items WHERE list_id = ?`, [listId]);
    return;
  }
  const placeholders = keepIds.map(() => '?').join(', ');
  await db.runAsync(`DELETE FROM items WHERE list_id = ? AND id NOT IN (${placeholders})`, [listId, ...keepIds]);
}

// --- Lists mirror (stores the server ListResponse JSON; `doc` is opaque here) ---

export async function putListDoc(
  db: Sql,
  list: { id: string; archived: boolean; updatedAt: string; doc: unknown },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO lists (id, doc_json, archived, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       doc_json = excluded.doc_json, archived = excluded.archived, updated_at = excluded.updated_at`,
    [list.id, JSON.stringify(list.doc), list.archived ? 1 : 0, list.updatedAt],
  );
}

// Both readers return the docs unordered: display order depends on fields inside `doc_json`
// (the caller's sortOrder / archivedAt), so the callers sort via src/domain/listOrder.ts.

export async function getListDocs<T = unknown>(db: Sql): Promise<T[]> {
  const rows = await db.getAllAsync<{ doc_json: string }>(`SELECT doc_json FROM lists WHERE archived = 0`);
  return rows.map(r => JSON.parse(r.doc_json) as T);
}

/** Archived lists, for the "Archived lists" view. */
export async function getArchivedListDocs<T = unknown>(db: Sql): Promise<T[]> {
  const rows = await db.getAllAsync<{ doc_json: string }>(`SELECT doc_json FROM lists WHERE archived = 1`);
  return rows.map(r => JSON.parse(r.doc_json) as T);
}

export async function getListDoc<T = unknown>(db: Sql, id: string): Promise<T | null> {
  const row = await db.getFirstAsync<{ doc_json: string }>(
    `SELECT doc_json FROM lists WHERE id = ?`, [id],
  );
  return row ? (JSON.parse(row.doc_json) as T) : null;
}

export async function getListIds(db: Sql): Promise<string[]> {
  const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM lists`);
  return rows.map(r => r.id);
}

/** Hard-remove a list and its items from the local mirror (server data is retained). */
export async function deleteListLocal(db: Sql, listId: string): Promise<void> {
  await db.runAsync(`DELETE FROM items WHERE list_id = ?`, [listId]);
  await db.runAsync(`DELETE FROM lists WHERE id = ?`, [listId]);
}

export interface OutboxRow {
  seq: number;
  op_json: string;
}

export async function insertOutbox(
  db: Sql,
  commandId: string,
  opJson: string,
  createdAt: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO outbox (command_id, op_json, created_at) VALUES (?, ?, ?)`,
    [commandId, opJson, createdAt],
  );
}

export async function pendingOutbox(db: Sql): Promise<OutboxRow[]> {
  return db.getAllAsync<OutboxRow>(
    `SELECT seq, op_json FROM outbox WHERE status = 'pending' ORDER BY seq ASC`,
  );
}

/** Pending rows that target a single list — used to scope a list's rebase to its own ops. */
export async function pendingOutboxForList(db: Sql, listId: string): Promise<OutboxRow[]> {
  return rowsForList(await pendingOutbox(db), listId);
}

export async function pendingCount(db: Sql): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM outbox WHERE status = 'pending'`);
  return row?.n ?? 0;
}

/** Count of outbox rows parked after a non-retryable failure (surfaced to the user). */
export async function parkedCount(db: Sql): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM outbox WHERE status = 'parked'`);
  return row?.n ?? 0;
}

export interface ParkedRow {
  seq: number;
  op_json: string;
  last_error: string | null;
}

/** Parked rows with their error, for the "Sync issues" recovery UI. */
export async function parkedOutbox(db: Sql): Promise<ParkedRow[]> {
  return db.getAllAsync<ParkedRow>(
    `SELECT seq, op_json, last_error FROM outbox WHERE status = 'parked' ORDER BY seq ASC`,
  );
}

/** Move a parked row back to pending (reset attempts) so the next drain re-attempts it. */
export async function requeueOutbox(db: Sql, seq: number): Promise<void> {
  await db.runAsync(`UPDATE outbox SET status = 'pending', attempts = 0, last_error = NULL WHERE seq = ?`, [seq]);
}

/** Every outbox row's op + status — used to badge mirror rows as pending/failed. */
export async function allOutboxRows(db: Sql): Promise<{ op_json: string; status: string }[]> {
  return db.getAllAsync<{ op_json: string; status: string }>(`SELECT op_json, status FROM outbox`);
}

export async function deleteOutbox(db: Sql, seq: number): Promise<void> {
  await db.runAsync(`DELETE FROM outbox WHERE seq = ?`, [seq]);
}

export async function bumpOutboxFailure(
  db: Sql,
  seq: number,
  status: 'pending' | 'parked',
  error: string,
): Promise<void> {
  await db.runAsync(`UPDATE outbox SET status = ?, attempts = attempts + 1, last_error = ? WHERE seq = ?`, [status, error, seq]);
}

// --- DB ownership (one account per device DB) ---

/**
 * Bind the local DB to the signed-in account. Same owner → no-op; unowned (fresh install, or one
 * that predates ownership stamping) → stamp without wiping, so a same-user relogin keeps offline
 * data and un-pushed edits; a DIFFERENT owner → wipe mirror + outbox before stamping, so the
 * previous account's data is never shown to — nor its pending ops replayed as — the new account.
 * (A DB left unowned-but-populated by a pre-stamping sign-out is adopted unwiped once; wiping
 * there would destroy a returning user's un-pushed edits, which is worse.)
 */
export async function adoptDbOwner(sub: string): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM meta WHERE key = 'owner_sub'`);
  if (row?.value === sub) return;
  await withWriteTxn(async tx => {
    if (row) {
      await tx.runAsync(`DELETE FROM items`);
      await tx.runAsync(`DELETE FROM lists`);
      await tx.runAsync(`DELETE FROM outbox`);
    }
    await tx.runAsync(
      `INSERT INTO meta (key, value) VALUES ('owner_sub', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [sub],
    );
  });
}
