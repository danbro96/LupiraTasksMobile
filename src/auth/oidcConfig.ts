// Authentik OIDC client config for LupiraTasks (public PKCE client — no secret).
// The Authority/issuer + client id must match the Authentik `tasks` application/provider
// (see DevOps/Websites/lupira-tasks-api/deployment.md Part 2).

export const OIDC_ISSUER = 'https://auth.lupira.com/application/o/tasks/';

/** Public client id — also the token `aud` the API validates. */
export const OIDC_CLIENT_ID = 'lupira-tasks';

/** `groups` drives admin; `offline_access` requests a refresh token. */
export const OIDC_SCOPES = ['openid', 'email', 'profile', 'groups', 'offline_access'];

/** App scheme (app.json `scheme`) — the redirect URI is `<scheme>://...`. */
export const OIDC_SCHEME = 'lupiratasks';
