import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { OIDC_CLIENT_ID, OIDC_ISSUER, OIDC_REDIRECT_PATH, OIDC_SCHEME, OIDC_SCOPES } from '../auth/oidcConfig';
import { decodeJwt, exchangeAuthCode } from '../auth/oidc';
import { logAuth, clearAuthLog } from '../auth/authDebug';
import { DebugPanel } from '../debug/DebugPanel';
import { useAuth } from '../store/auth-store';
import { colors, radii, spacing, type } from '../theme';

// Required so the auth redirect back into the app dismisses the in-app browser.
WebBrowser.maybeCompleteAuthSession();

export function LoginScreen() {
  const discovery = AuthSession.useAutoDiscovery(OIDC_ISSUER);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: OIDC_SCHEME, path: OIDC_REDIRECT_PATH });
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    { clientId: OIDC_CLIENT_ID, scopes: OIDC_SCOPES, redirectUri, usePKCE: true },
    discovery,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Surface the static config once so it can be compared to the Authentik provider.
  useEffect(() => {
    logAuth('config', `issuer=${OIDC_ISSUER} client=${OIDC_CLIENT_ID} redirectUri=${redirectUri}`);
  }, [redirectUri]);

  useEffect(() => {
    logAuth(discovery ? 'discovery:loaded' : 'discovery:loading', discovery?.tokenEndpoint ?? undefined);
  }, [discovery]);

  useEffect(() => {
    if (request) logAuth('request:ready', `verifier=${!!request.codeVerifier}`);
  }, [request]);

  // Diagnostic: log any deep link that reaches the app (the Authentik redirect should show
  // up here as lupiratasks://...?code=…). If it arrives but auth still 'dismiss'es, the issue
  // is session matching; if it never arrives, the redirect isn't returning to the app's task.
  useEffect(() => {
    void Linking.getInitialURL().then(u => { if (u) logAuth('linking:initial', u); });
    const sub = Linking.addEventListener('url', ({ url }) => logAuth('linking:url', url));
    return () => sub.remove();
  }, []);

  async function handleSignIn() {
    clearAuthLog();
    logAuth('config', `issuer=${OIDC_ISSUER} client=${OIDC_CLIENT_ID} redirectUri=${redirectUri}`);
    logAuth('prompt:open');
    try {
      // createTask:false (Android) keeps the auth tab in the app's task so the redirect can
      // return into it — without this the redirect lands in a separate task and resolves
      // 'dismiss' (expo/expo#23781).
      const result = await promptAsync({ createTask: false });
      logAuth('prompt:result', result.type);
    } catch (e) {
      logAuth('prompt:throw', String(e));
    }
  }

  useEffect(() => {
    if (!response) return;
    logAuth('response', response.type);

    if (response.type === 'error') {
      const msg = response.error?.message ?? 'Sign-in failed.';
      logAuth('response:error', `${response.error?.code ?? ''} ${msg}`.trim());
      setError(msg);
      return;
    }
    if (response.type !== 'success') {
      // dismiss / cancel / locked — no params to exchange. Stop with a visible reason.
      logAuth('response:not-success', response.type);
      setError(`Sign-in did not complete (${response.type}).`);
      return;
    }
    if (!discovery || !request) {
      logAuth('response:guard', `discovery=${!!discovery} request=${!!request}`);
      return;
    }
    logAuth('response:params', `code=${!!response.params.code} state=${!!response.params.state}`);

    (async () => {
      setBusy(true);
      setError(null);
      try {
        const tokenEndpoint = discovery.tokenEndpoint;
        logAuth('exchange:start', `endpoint=${tokenEndpoint ?? 'MISSING'} verifier=${!!request.codeVerifier}`);
        if (!tokenEndpoint) {
          setError('Discovery returned no token endpoint.');
          return;
        }
        const token = await exchangeAuthCode({
          tokenEndpoint,
          code: response.params.code,
          redirectUri,
          codeVerifier: request.codeVerifier,
        });
        logAuth(
          'exchange:ok',
          `accessToken=${!!token.accessToken} idToken=${!!token.idToken} refresh=${!!token.refreshToken} expiresIn=${token.expiresIn ?? 'n/a'}`,
        );
        const claims = decodeJwt(token.idToken ?? token.accessToken);
        const email = (claims.email as string) ?? (claims.preferred_username as string) ?? (claims.sub as string) ?? '';
        const name = (claims.name as string) ?? (claims.given_name as string) ?? undefined;
        logAuth('decode', `email=${email ? 'present' : 'EMPTY'} name=${name ? 'present' : 'none'}`);
        await useAuth.getState().setSession(
          {
            accessToken: token.accessToken,
            refreshToken: token.refreshToken,
            expiresAt: Date.now() + (token.expiresIn ?? 3600) * 1000,
          },
          { sub: email, displayName: name },
        );
        logAuth('setSession', 'authed=true');
      } catch (e) {
        const err = e as { code?: string; description?: string; message?: string };
        logAuth('exchange:error', `${err.code ?? ''} ${err.description ?? ''} ${err.message ?? String(e)}`.trim());
        setError(err.message ?? String(e));
      } finally {
        setBusy(false);
      }
    })();
  }, [response, discovery, request, redirectUri]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Lupira Tasks</Text>
      <Text style={styles.subtitle}>Sign in with your family account.</Text>

      <Pressable
        style={[styles.button, (!request || busy) && styles.buttonDisabled]}
        disabled={!request || busy}
        onPress={() => void handleSignIn()}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in with Authentik</Text>}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.hint}>redirect: {redirectUri}</Text>

      <DebugPanel />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.bg },
  title: { ...type.title },
  subtitle: { marginTop: spacing.sm, marginBottom: 28, fontSize: 15, color: colors.textMuted },
  button: { backgroundColor: colors.primary, borderRadius: radii.lg, paddingVertical: 14, paddingHorizontal: 28, minWidth: 240, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.onPrimary, fontSize: 16, fontWeight: '600' },
  error: { marginTop: spacing.lg, color: colors.danger, textAlign: 'center' },
  hint: { marginTop: spacing.md, fontSize: 11, color: colors.textDisabled },
});
