import * as SQLite from 'expo-sqlite';
import type { ItemState } from '../domain/itemState';
import { rowsForList } from '../domain/outboxScope';

// One SQLite database holds the offline read-model mirror (lists + items as JSON docs)
// and the durable mutation outbox, so an optimistic apply + enqueue commit atomically.
// The mirror is what the UI reads offline; the outbox is replayed on reconnect.

const DB_NAME = 'lupira-tasks-offline.db';
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = init();
  return dbPromise;
}

async function init(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY NOT NULL,
      doc_json TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      deleted INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY NOT NULL,
      list_id TEXT NOT NULL,
      state_json TEXT NOT NULL,
      sort_order TEXT NOT NULL DEFAULT '',
      completed INTEGER NOT NULL DEFAULT 0,
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
    CREATE TABLE IF NOT EXISTS sync_state (
      list_id TEXT PRIMARY KEY NOT NULL,
      cursor TEXT,
      last_pulled_at TEXT
    );
  `);
  return db;
}

// --- Items mirror ---

export async function putItemState(db: SQLite.SQLiteDatabase, s: ItemState): Promise<void> {
  await db.runAsync(
    `INSERT INTO items (id, list_id, state_json, sort_order, completed, deleted, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       list_id = excluded.list_id, state_json = excluded.state_json,
       sort_order = excluded.sort_order, completed = excluded.completed,
       deleted = excluded.deleted, updated_at = excluded.updated_at`,
    [s.id, s.listId, JSON.stringify(s), s.sortOrder, s.completed ? 1 : 0, s.deleted ? 1 : 0, s.updatedAt],
  );
}

export async function getItemState(db: SQLite.SQLiteDatabase, id: string): Promise<ItemState | null> {
  const row = await db.getFirstAsync<{ state_json: string }>(`SELECT state_json FROM items WHERE id = ?`, [id]);
  return row ? (JSON.parse(row.state_json) as ItemState) : null;
}

export async function getItemsByList(db: SQLite.SQLiteDatabase, listId: string): Promise<ItemState[]> {
  const rows = await db.getAllAsync<{ state_json: string }>(
    `SELECT state_json FROM items WHERE list_id = ? AND deleted = 0 ORDER BY sort_order ASC`,
    [listId],
  );
  return rows.map(r => JSON.parse(r.state_json) as ItemState);
}

// --- Lists mirror (stores the server ListResponse JSON; `doc` is opaque here) ---

export async function putListDoc(
  db: SQLite.SQLiteDatabase,
  list: { id: string; archived: boolean; deleted: boolean; updatedAt: string; doc: unknown },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO lists (id, doc_json, archived, deleted, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       doc_json = excluded.doc_json, archived = excluded.archived,
       deleted = excluded.deleted, updated_at = excluded.updated_at`,
    [list.id, JSON.stringify(list.doc), list.archived ? 1 : 0, list.deleted ? 1 : 0, list.updatedAt],
  );
}

export async function getListDocs<T = unknown>(db: SQLite.SQLiteDatabase): Promise<T[]> {
  const rows = await db.getAllAsync<{ doc_json: string }>(
    `SELECT doc_json FROM lists WHERE deleted = 0 AND archived = 0 ORDER BY updated_at DESC`,
  );
  return rows.map(r => JSON.parse(r.doc_json) as T);
}

/** Archived (but not deleted) lists, for the "Archived lists" view. */
export async function getArchivedListDocs<T = unknown>(db: SQLite.SQLiteDatabase): Promise<T[]> {
  const rows = await db.getAllAsync<{ doc_json: string }>(
    `SELECT doc_json FROM lists WHERE deleted = 0 AND archived = 1 ORDER BY updated_at DESC`,
  );
  return rows.map(r => JSON.parse(r.doc_json) as T);
}

export async function getListDoc<T = unknown>(db: SQLite.SQLiteDatabase, id: string): Promise<T | null> {
  const row = await db.getFirstAsync<{ doc_json: string }>(
    `SELECT doc_json FROM lists WHERE id = ? AND deleted = 0`, [id],
  );
  return row ? (JSON.parse(row.doc_json) as T) : null;
}

export async function getListIds(db: SQLite.SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM lists WHERE deleted = 0`);
  return rows.map(r => r.id);
}

/** Hard-remove a list and its items/cursor from the local mirror (server data is retained). */
export async function deleteListLocal(db: SQLite.SQLiteDatabase, listId: string): Promise<void> {
  await db.runAsync(`DELETE FROM items WHERE list_id = ?`, [listId]);
  await db.runAsync(`DELETE FROM sync_state WHERE list_id = ?`, [listId]);
  await db.runAsync(`DELETE FROM lists WHERE id = ?`, [listId]);
}

// --- Outbox ---

export interface OutboxRow {
  seq: number;
  command_id: string;
  op_json: string;
  status: string;
  attempts: number;
}

export async function insertOutbox(
  db: SQLite.SQLiteDatabase,
  commandId: string,
  opJson: string,
  createdAt: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO outbox (command_id, op_json, created_at) VALUES (?, ?, ?)`,
    [commandId, opJson, createdAt],
  );
}

export async function pendingOutbox(db: SQLite.SQLiteDatabase): Promise<OutboxRow[]> {
  return db.getAllAsync<OutboxRow>(
    `SELECT seq, command_id, op_json, status, attempts FROM outbox WHERE status = 'pending' ORDER BY seq ASC`,
  );
}

/** Pending rows that target a single list — used to scope a list's rebase to its own ops. */
export async function pendingOutboxForList(db: SQLite.SQLiteDatabase, listId: string): Promise<OutboxRow[]> {
  return rowsForList(await pendingOutbox(db), listId);
}

export async function pendingCount(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM outbox WHERE status = 'pending'`);
  return row?.n ?? 0;
}

/** Count of outbox rows parked after a non-retryable failure (surfaced to the user). */
export async function parkedCount(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM outbox WHERE status = 'parked'`);
  return row?.n ?? 0;
}

export interface ParkedRow {
  seq: number;
  op_json: string;
  last_error: string | null;
}

/** Parked rows with their error, for the "Sync issues" recovery UI. */
export async function parkedOutbox(db: SQLite.SQLiteDatabase): Promise<ParkedRow[]> {
  return db.getAllAsync<ParkedRow>(
    `SELECT seq, op_json, last_error FROM outbox WHERE status = 'parked' ORDER BY seq ASC`,
  );
}

/** Move a parked row back to pending (reset attempts) so the next drain re-attempts it. */
export async function requeueOutbox(db: SQLite.SQLiteDatabase, seq: number): Promise<void> {
  await db.runAsync(`UPDATE outbox SET status = 'pending', attempts = 0, last_error = NULL WHERE seq = ?`, [seq]);
}

/** Every outbox row's op + status — used to badge mirror rows as pending/failed. */
export async function allOutboxRows(db: SQLite.SQLiteDatabase): Promise<{ op_json: string; status: string }[]> {
  return db.getAllAsync<{ op_json: string; status: string }>(`SELECT op_json, status FROM outbox`);
}

export async function deleteOutbox(db: SQLite.SQLiteDatabase, seq: number): Promise<void> {
  await db.runAsync(`DELETE FROM outbox WHERE seq = ?`, [seq]);
}

export async function bumpOutboxFailure(
  db: SQLite.SQLiteDatabase,
  seq: number,
  status: 'pending' | 'parked',
  error: string,
): Promise<void> {
  await db.runAsync(`UPDATE outbox SET status = ?, attempts = attempts + 1, last_error = ? WHERE seq = ?`, [status, error, seq]);
}

// --- Sync cursor ---

export async function getCursor(db: SQLite.SQLiteDatabase, listId: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ cursor: string | null }>(`SELECT cursor FROM sync_state WHERE list_id = ?`, [listId]);
  return row?.cursor ?? null;
}

export async function setCursor(db: SQLite.SQLiteDatabase, listId: string, cursor: string, at: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_state (list_id, cursor, last_pulled_at) VALUES (?, ?, ?)
     ON CONFLICT(list_id) DO UPDATE SET cursor = excluded.cursor, last_pulled_at = excluded.last_pulled_at`,
    [listId, cursor, at],
  );
}
