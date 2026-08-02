import { DatabaseSync } from 'node:sqlite';

// Test-only stand-in for the expo-sqlite SQLiteDatabase subset the data layer uses, backed by
// node:sqlite so SQL semantics (transactions, constraints, PRAGMAs) are real. Injected per test
// file via vi.mock('expo-sqlite'). withTransactionAsync mirrors expo-sqlite's implementation
// exactly — a bare BEGIN/COMMIT with NO mutex — so concurrency tests exercise the real
// nested-BEGIN hazard. Every method yields a macrotask first, so async interleaving is realistic.

type SqlParam = null | number | string;
type StatementMethod = 'execAsync' | 'runAsync' | 'getFirstAsync' | 'getAllAsync';

export interface FakeSqliteDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: unknown[]): Promise<void>;
  getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  /** Peak number of statements that were in flight at once — 1 proves the gate holds. */
  maxInFlight: number;
  /** Make the next call to `method` reject, without running any SQL (mirrors expo-modules-core
   *  failing during argument conversion, before the statement executes). */
  failNext(method: StatementMethod, error: Error): void;
}

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

export function createFakeDb(): FakeSqliteDb {
  const db = new DatabaseSync(':memory:');
  const faults = new Map<StatementMethod, Error>();
  let inFlight = 0;

  // Counts the whole statement span (yield included), so any overlap registers.
  async function statement<T>(method: StatementMethod, run: () => T): Promise<T> {
    inFlight += 1;
    fake.maxInFlight = Math.max(fake.maxInFlight, inFlight);
    try {
      await tick();
      const fault = faults.get(method);
      if (fault) {
        faults.delete(method);
        throw fault;
      }
      return run();
    } finally {
      inFlight -= 1;
    }
  }

  const fake: FakeSqliteDb = {
    maxInFlight: 0,
    failNext(method, error) {
      faults.set(method, error);
    },
    execAsync(sql) {
      return statement('execAsync', () => { db.exec(sql); });
    },
    runAsync(sql, params = []) {
      return statement('runAsync', () => { db.prepare(sql).run(...(params as SqlParam[])); });
    },
    getFirstAsync<T>(sql: string, params: unknown[] = []) {
      return statement('getFirstAsync', () => (db.prepare(sql).get(...(params as SqlParam[])) as T | undefined) ?? null);
    },
    getAllAsync<T>(sql: string, params: unknown[] = []) {
      return statement('getAllAsync', () => db.prepare(sql).all(...(params as SqlParam[])) as T[]);
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
