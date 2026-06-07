// The auth flow uses the shared debug log; these aliases keep the auth-specific call sites
// (LoginScreen, oidc.ts) reading/writing the same buffer the offline path uses.
export {
  useDebugLog as useAuthLog,
  logDebug as logAuth,
  clearDebugLog as clearAuthLog,
  type DebugLogEntry as AuthLogEntry,
} from '../debug/log';
