import { describe, it, expect, vi } from 'vitest';
import { createFakeDb } from '../test/fakeExpoSqlite';
import { itemResponseToState } from '../domain/itemMap';
import { applyItemEvent } from '../domain/itemLww';
import type { ClientOp } from '../domain/ops';
import type { AuthPort } from '../data/api/authProvider';
import type { ItemDto, ListDto, PersonRef } from '../data/api/generated/models';

// Pull-path tests over a real in-memory SQLite (node:sqlite behind the expo-sqlite surface) with
// the generated API mocked. Each test re-imports the module graph: getDb memoizes a connection
// and sync/outbox hold coalescing state.

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => holder.db }));
vi.mock('react-native', () => ({ AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) } }));
vi.mock('@react-native-community/netinfo', () => ({ default: { addEventListener: vi.fn(() => () => {}) } }));
vi.mock('@sentry/react-native', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), setUser: vi.fn(), addBreadcrumb: vi.fn() }));
vi.mock('../debug/log', () => ({ logDebug: vi.fn() }));
vi.mock('./replayOp', () => ({ replayOp: vi.fn() }));
vi.mock('../data/api/generated/sync/sync', () => ({ syncList: vi.fn() }));
vi.mock('../data/api/generated/lists/lists', () => ({ listLists: vi.fn() }));
vi.mock('../data/api/generated/me/me', () => ({ getMe: vi.fn() }));

const ME: PersonRef = { principalId: 'me-p', email: 'me@x', displayName: 'Me' };
const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-02-01T00:00:00.000Z';
const T2 = '2026-03-01T00:00:00.000Z';

function list(id: string, over: Partial<ListDto> = {}): ListDto {
  return {
    id, name: `List ${id}`, kind: 'Todo', color: null, simplePriority: true,
    owner: ME, access: 'Owner', isArchived: false, createdAt: T0, updatedAt: T0, tags: [], members: [], ...over,
  };
}

function item(id: string, over: Partial<ItemDto> = {}): ItemDto {
  return {
    id, listId: 'L1', parentItemId: null, title: `Item ${id}`, notes: null,
    status: 'Open', completed: false, completedAt: null, assignee: null, dueAt: null,
    quantity: null, unit: null, priority: 0, tags: [], sortOrder: id,
    createdAt: T0, updatedAt: T0, ...over,
  };
}

const ok = <T,>(data: T) => ({ status: 200 as const, data, headers: new Headers() });

async function load() {
  vi.resetModules();
  holder.db = createFakeDb();
  const { setAuthPort } = await import('../data/api/authProvider');
  const port: AuthPort = {
    getApiUrl: () => 'https://api.test',
    getAuthMode: () => 'oidc' as const,
    getToken: () => 'tok',
    getActor: () => 'me-p',
    getSelf: () => ME,
    refresh: async () => 'tok',
    applyProfile: async () => {},
    onSignIn: () => () => {},
  };
  setAuthPort(port);
  const sync = await import('./sync');
  const dbm = await import('../data/db');
  const { useSyncStatus } = await import('./syncStatus');
  // instanceof checks (isNetworkError) must see the same class the fresh module graph uses.
  const { ApiError } = await import('../domain/apiError');
  const { listLists } = await import('../data/api/generated/lists/lists');
  const { syncList } = await import('../data/api/generated/sync/sync');
  const { getMe } = await import('../data/api/generated/me/me');
  const db = await dbm.getDb();
  return {
    sync, dbm, db, useSyncStatus, ApiError,
    listLists: vi.mocked(listLists),
    getSync: vi.mocked(syncList),
    getMe: vi.mocked(getMe),
  };
}

type Ctx = Awaited<ReturnType<typeof load>>;

async function seedList(c: Ctx, id: string, over: Partial<ListDto> = {}) {
  await c.dbm.putListDoc(c.db, { id, archived: over.isArchived ?? false, updatedAt: T0, doc: list(id, over) });
}

async function seedOp(c: Ctx, op: ClientOp) {
  await c.dbm.insertOutbox(c.db, op.commandId, JSON.stringify(op), op.occurredAt);
}

describe('pullList', () => {
  it('removes items that disappeared server-side', async () => {
    const c = await load();
    await seedList(c, 'L1');
    await c.dbm.putItemState(c.db, itemResponseToState(item('X')));
    c.getSync.mockResolvedValue(ok({ list: list('L1'), items: [item('Y')], nextCursor: 1 }));

    await c.sync.pullList('L1');

    expect(await c.dbm.getItemState(c.db, 'X')).toBeNull();
    expect((await c.dbm.getItemsByList(c.db, 'L1')).map(i => i.id)).toEqual(['Y']);
  });

  it('a locally-created item with pending ops survives the deletion pass via rebase', async () => {
    const c = await load();
    await seedList(c, 'L1');
    await seedOp(c, { commandId: 'c1', occurredAt: T1, kind: 'item.create', listId: 'L1', itemId: 'N', title: 'New task', sortOrder: 'a', parentItemId: null });
    await seedOp(c, { commandId: 'c2', occurredAt: T2, kind: 'item.rename', listId: 'L1', itemId: 'N', title: 'Renamed task' });
    c.getSync.mockResolvedValue(ok({ list: list('L1'), items: [], nextCursor: 1 }));

    await c.sync.pullList('L1');

    const n = await c.dbm.getItemState(c.db, 'N');
    expect(n?.title).toBe('Renamed task');
    expect(n?.deleted).toBe(false);
  });

  it('a pending edit to a server-deleted item leaves no ghost row', async () => {
    const c = await load();
    await seedList(c, 'L1');
    await c.dbm.putItemState(c.db, itemResponseToState(item('G')));
    await seedOp(c, { commandId: 'c1', occurredAt: T1, kind: 'item.rename', listId: 'L1', itemId: 'G', title: 'Too late' });
    c.getSync.mockResolvedValue(ok({ list: list('L1'), items: [], nextCursor: 1 }));

    await c.sync.pullList('L1');

    expect(await c.dbm.getItemState(c.db, 'G')).toBeNull();
  });

  it('an op acked while the pull response is in flight still rebases (pre-GET snapshot)', async () => {
    const c = await load();
    await seedList(c, 'L1');
    await c.dbm.putItemState(c.db, itemResponseToState(item('X')));
    await seedOp(c, { commandId: 'c1', occurredAt: T1, kind: 'item.rename', listId: 'L1', itemId: 'X', title: 'User edit' });
    c.getSync.mockImplementation(async () => {
      await c.dbm.deleteOutbox(c.db, 1); // the drain acks the op mid-flight; the base below predates it
      return ok({ list: list('L1'), items: [item('X')], nextCursor: 1 });
    });

    await c.sync.pullList('L1');

    expect((await c.dbm.getItemState(c.db, 'X'))?.title).toBe('User edit');
  });

  it('rebases pending list.* ops onto the pulled doc', async () => {
    const c = await load();
    await seedList(c, 'L1');
    await seedOp(c, { commandId: 'c1', occurredAt: T1, kind: 'list.rename', listId: 'L1', name: 'Local name' });
    c.getSync.mockResolvedValue(ok({ list: list('L1', { name: 'Server name' }), items: [], nextCursor: 1 }));

    await c.sync.pullList('L1');

    expect((await c.dbm.getListDoc<ListDto>(c.db, 'L1'))?.name).toBe('Local name');
  });

  it('a pending list.delete is not resurrected by the pull', async () => {
    const c = await load();
    await seedOp(c, { commandId: 'c1', occurredAt: T1, kind: 'list.delete', listId: 'L1' });
    c.getSync.mockResolvedValue(ok({ list: list('L1'), items: [item('X')], nextCursor: 1 }));

    await c.sync.pullList('L1');

    expect(await c.dbm.getListDoc(c.db, 'L1')).toBeNull();
    expect(await c.dbm.getItemsByList(c.db, 'L1')).toEqual([]);
  });

  it('a local tombstone with a pending item.delete stays deleted', async () => {
    const c = await load();
    await seedList(c, 'L1');
    const tombstoned = applyItemEvent(itemResponseToState(item('X')), { type: 'ItemDeleted', itemId: 'X', occurredAt: T1, commandId: 'c1' }, 'me-p');
    await c.dbm.putItemState(c.db, tombstoned);
    await seedOp(c, { commandId: 'c1', occurredAt: T1, kind: 'item.delete', listId: 'L1', itemId: 'X' });
    c.getSync.mockResolvedValue(ok({ list: list('L1'), items: [item('X')], nextCursor: 1 }));

    await c.sync.pullList('L1');

    expect((await c.dbm.getItemState(c.db, 'X'))?.deleted).toBe(true);
    expect(await c.dbm.getItemsByList(c.db, 'L1')).toEqual([]);
  });
});

describe('pullLists', () => {
  it('mirrors archived lists, prunes vanished ones, returns active ids', async () => {
    const c = await load();
    await seedList(c, 'B'); // was active locally, archived server-side since
    await seedList(c, 'C'); // no longer on the server at all
    c.listLists.mockImplementation(async params =>
      ok(params?.archived ? [list('B', { isArchived: true })] : [list('A')]));

    const ids = await c.sync.pullLists();

    expect(ids).toEqual(['A']);
    expect((await c.dbm.getListDocs<ListDto>(c.db)).map(l => l.id)).toEqual(['A']);
    expect((await c.dbm.getArchivedListDocs<ListDto>(c.db)).map(l => l.id)).toEqual(['B']);
    expect(await c.dbm.getListDoc(c.db, 'C')).toBeNull();
  });

  it('pending ops protect their list from the prune; parked ops do not', async () => {
    const c = await load();
    await seedList(c, 'P');
    await seedList(c, 'Q');
    await seedOp(c, { commandId: 'c1', occurredAt: T1, kind: 'list.create', listId: 'P', name: 'P', listKind: 'Todo', color: null });
    await seedOp(c, { commandId: 'c2', occurredAt: T1, kind: 'list.create', listId: 'Q', name: 'Q', listKind: 'Todo', color: null });
    await c.dbm.bumpOutboxFailure(c.db, 2, 'parked', '403 forbidden');
    c.listLists.mockResolvedValue(ok([]));

    await c.sync.pullLists();

    expect(await c.dbm.getListDoc(c.db, 'P')).not.toBeNull();
    expect(await c.dbm.getListDoc(c.db, 'Q')).toBeNull();
  });

  it('a list whose create op acks mid-pull is still protected (pre-GET snapshot)', async () => {
    const c = await load();
    await seedList(c, 'P');
    await seedOp(c, { commandId: 'c1', occurredAt: T1, kind: 'list.create', listId: 'P', name: 'P', listKind: 'Todo', color: null });
    c.listLists.mockImplementation(async () => {
      await c.dbm.deleteOutbox(c.db, 1); // acked while the response is in flight
      return ok([]);
    });

    await c.sync.pullLists();

    expect(await c.dbm.getListDoc(c.db, 'P')).not.toBeNull();
  });

  it('rebases pending list.* ops onto pulled docs', async () => {
    const c = await load();
    await seedOp(c, { commandId: 'c1', occurredAt: T1, kind: 'list.archive', listId: 'A' });
    c.listLists.mockImplementation(async params => ok(params?.archived ? [] : [list('A')]));

    await c.sync.pullLists();

    expect((await c.dbm.getArchivedListDocs<ListDto>(c.db)).map(l => l.id)).toEqual(['A']);
  });
});

describe('runSync', () => {
  function arm(c: Ctx) {
    c.getMe.mockResolvedValue(ok({ principalId: 'me-p', email: 'me@x', displayName: 'Me', isAdmin: false }));
    c.listLists.mockImplementation(async params => ok(params?.archived ? [] : [list('A'), list('B')]));
  }

  it('continues past a per-list failure (deleted-between-GETs 404)', async () => {
    const c = await load();
    arm(c);
    c.getSync.mockImplementation(async listId => {
      if (listId === 'A') throw new c.ApiError(404, 'gone');
      return ok({ list: list(listId), items: [], nextCursor: 1 });
    });

    await c.sync.syncAll();

    expect(await c.dbm.getListDoc(c.db, 'B')).not.toBeNull();
    expect(c.useSyncStatus.getState().serverReachable).toBe(true);
    expect(c.useSyncStatus.getState().lastError).toBeNull();
    expect(c.useSyncStatus.getState().firstSyncDone).toBe(true);
  });

  it('stops on a network error and marks the server unreachable', async () => {
    const c = await load();
    arm(c);
    c.getSync.mockRejectedValue(new c.ApiError(0, 'offline'));

    await c.sync.syncAll();

    expect(c.useSyncStatus.getState().serverReachable).toBe(false);
    expect(c.useSyncStatus.getState().lastError).toBe('offline');
    expect(c.useSyncStatus.getState().firstSyncDone).toBe(true);
  });
});
