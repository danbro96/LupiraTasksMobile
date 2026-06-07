import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { OIDC_CLIENT_ID, OIDC_ISSUER, OIDC_SCHEME, OIDC_SCOPES } from '../auth/oidcConfig';
import { decodeJwt } from '../auth/oidc';
import { useAuth } from '../store/auth-store';

// Required so the auth redirect back into the app dismisses the in-app browser.
WebBrowser.maybeCompleteAuthSession();

export function LoginScreen() {
  const discovery = AuthSession.useAutoDiscovery(OIDC_ISSUER);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: OIDC_SCHEME });
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    { clientId: OIDC_CLIENT_ID, scopes: OIDC_SCOPES, redirectUri, usePKCE: true },
    discovery,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!response) return;
    if (response.type === 'error') {
      setError(response.error?.message ?? 'Sign-in failed.');
      return;
    }
    if (response.type !== 'success' || !discovery || !request) return;

    (async () => {
      setBusy(true);
      setError(null);
      try {
        const token = await AuthSession.exchangeCodeAsync(
          {
            clientId: OIDC_CLIENT_ID,
            code: response.params.code,
            redirectUri,
            extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : {},
          },
          discovery,
        );
        const claims = decodeJwt(token.idToken ?? token.accessToken);
        const email = (claims.email as string) ?? (claims.preferred_username as string) ?? (claims.sub as string) ?? '';
        const name = (claims.name as string) ?? (claims.given_name as string) ?? undefined;
        await useAuth.getState().setSession(
          {
            accessToken: token.accessToken,
            refreshToken: token.refreshToken,
            expiresAt: Date.now() + (token.expiresIn ?? 3600) * 1000,
          },
          { sub: email, displayName: name },
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
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
        onPress={() => promptAsync()}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in with Authentik</Text>}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.hint}>redirect: {redirectUri}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 26, fontWeight: '700' },
  subtitle: { marginTop: 8, marginBottom: 28, fontSize: 15, color: '#6e7686' },
  button: { backgroundColor: '#1d3a5f', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 28, minWidth: 240, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { marginTop: 16, color: '#b3261e', textAlign: 'center' },
  hint: { position: 'absolute', bottom: 16, fontSize: 11, color: '#aab0bc' },
});
