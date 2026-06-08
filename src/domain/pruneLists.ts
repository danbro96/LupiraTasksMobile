// Pure helper for the pull/prune decision, kept framework-free so it can be unit-tested
// without dragging in expo-sqlite / react-native (see pruneLists.test.ts).

/**
 * Mirror list ids to prune: present locally but no longer returned by the server, AND not
 * protected by a pending (un-pushed) local op. Server data is event-sourced and retained, so a
 * pruned list re-appears on a later pull if access is restored.
 */
export function listsToPrune(mirrorIds: string[], serverIds: string[], protectedIds: Set<string>): string[] {
  const server = new Set(serverIds);
  return mirrorIds.filter(id => !server.has(id) && !protectedIds.has(id));
}
