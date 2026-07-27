import { DatabaseSync } from 'node:sqlite';

// Test-only stand-in for the expo-sqlite SQLiteDatabase subset the data layer uses, backed by
// node:sqlite so SQL semantics (transactions, constraints, PRAGMAs) are real. Injected per test
// file via vi.mock('expo-sqlite'). withTransactionAsync mirrors expo-sqlite's implementation
// exactly — a bare BEGIN/COMMIT with NO mutex — so concurrency tests exercise the real
// nested-BEGIN hazard. Every method yields a macrotask first, so async interleaving is realistic.

type SqlParam = null | number | string;

export interface FakeSqliteDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: unknown[]): Promise<void>;
  getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

export function createFakeDb(): FakeSqliteDb {
  const db = new DatabaseSync(':memory:');
  const fake: FakeSqliteDb = {
    async execAsync(sql) {
      await tick();
      db.exec(sql);
    },
    async runAsync(sql, params = []) {
      await tick();
      db.prepare(sql).run(...(params as SqlParam[]));
    },
    async getFirstAsync<T>(sql: string, params: unknown[] = []) {
      await tick();
      const row = db.prepare(sql).get(...(params as SqlParam[])) as T | undefined;
      return row ?? null;
    },
    async getAllAsync<T>(sql: string, params: unknown[] = []) {
      await tick();
      return db.prepare(sql).all(...(params as SqlParam[])) as T[];
    },
    async withTransactionAsync(task) {
      try {
        await fake.execAsync('BEGIN');
        await task();
        await fake.execAsync('COMMIT');
      } catch (e) {
        await fake.execAsync('ROLLBACK');
        throw e;
      }
    },
  };
  return fake;
}
