// Dependency-inversion seam between the lower layers (the API mutator; the offline sync/outbox
// engine) and the auth session that lives "above" them in the state layer. Those layers need a
// live token, the current actor, and the ability to trigger a refresh — but importing the Zustand
// auth store directly would point a dependency upward (data/sync → state). Instead the store
// registers a concrete provider at startup via setAuthPort, and consumers read it through
// authPort(). The interface is exactly the auth capabilities the lower layers depend on.

import type { PersonRef } from './generated/models';

export interface AuthPort {
  /** Base URL for API requests (honours the settings-screen override). */
  getApiUrl: () => string;
  /** Current access token, or null when signed out. */
  getToken: () => string | null;
  /** The signed-in user's principal id (matches the server's PersonRef.principalId) — the actor
   *  for optimistic created/completed-by. Null until the first `/me` resolves it. */
  getActor: () => string | null;
  /** The signed-in user's full identity, for the optimistic list-owner/addedBy seed. Null until
   *  the first `/me` resolves the principal id. */
  getSelf: () => PersonRef | null;
  /** Ensure a live token: proactive (near-expiry) by default, or `force` after a server 401.
   *  Forced callers pass `sentToken` (the token the rejected request sent) so an already-completed
   *  refresh isn't repeated. Returns the live token, or null if the session is gone. */
  refresh: (force?: boolean, sentToken?: string) => Promise<string | null>;
  /** Merge a freshly-pulled `/me` profile into the cached session. */
  applyProfile: (profile: { principalId?: string; displayName?: string | null; isAdmin?: boolean }) => Promise<void>;
  /** Invoke `cb` whenever a sign-in happens (token goes absent→present). Returns an unsubscribe. */
  onSignIn: (cb: () => void) => () => void;
}

let port: AuthPort | null = null;

/** Registered once by the auth store at module load — before any request can fire. */
export function setAuthPort(p: AuthPort): void {
  port = p;
}

export function authPort(): AuthPort {
  if (!port) throw new Error('AuthPort not registered — import the auth store before using it.');
  return port;
}
