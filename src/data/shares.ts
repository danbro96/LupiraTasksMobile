import {
  postListsListIdShares,
  getListsListIdShares,
  deleteListsListIdSharesShareId,
} from './api/generated/shares/shares';
import type { ShareAccess, ShareResponse } from './api/generated/models';
import { ApiError } from '../domain/apiError';

// Public share links for a list (Owner-only). These are immediate online calls, not
// event-sourced list mutations, so they bypass the outbox — same direct-fetch shape as
// useDirectory. apiFetch already throws ApiError on any non-2xx; the status checks below
// only narrow the generated response union to the success member.

export async function listShareLinks(listId: string): Promise<ShareResponse[]> {
  const r = await getListsListIdShares(listId);
  if (r.status === 200) return r.data.shares;
  throw new ApiError(r.status, `List shares failed (${r.status})`);
}

export async function createShareLink(listId: string, access: ShareAccess): Promise<ShareResponse> {
  const r = await postListsListIdShares(listId, { access });
  if (r.status === 200) return r.data;
  throw new ApiError(r.status, `Create share failed (${r.status})`);
}

export async function revokeShareLink(listId: string, shareId: string): Promise<void> {
  const r = await deleteListsListIdSharesShareId(listId, shareId);
  if (r.status === 204) return;
  throw new ApiError(r.status, `Revoke share failed (${r.status})`);
}
