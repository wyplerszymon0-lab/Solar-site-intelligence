// How the backend proves who it is to the Claude API (AI_PROVIDER=anthropic).
//
//   federation: ANTHROPIC_FEDERATION_RULE_ID is set. The Cloud Run service account asks
//               the metadata server for a Google ID token (audience api.anthropic.com)
//               and the SDK exchanges it for a short-lived Anthropic access token,
//               refreshed before it expires. Nothing secret is stored anywhere.
//   key:        ANTHROPIC_API_KEY, for local runs.

import { oidcFederationProvider } from '@anthropic-ai/sdk/lib/credentials/oidc-federation';

export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
export const METADATA_IDENTITY_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity' +
  `?audience=${ANTHROPIC_BASE_URL}&format=full`;

// A fresh token on every call: federation tokens are single-use in the exchange.
export function googleIdentityToken(fetchFn) {
  return async () => {
    const res = await fetchFn(METADATA_IDENTITY_URL, { headers: { 'Metadata-Flavor': 'Google' } });
    if (!res.ok) throw new Error(`metadata server returned ${res.status} for the identity token`);
    return (await res.text()).trim();
  };
}

// Options for new Anthropic(...). Throws on a missing or ambiguous configuration.
export function anthropicClientOptions(env, fetchFn = fetch) {
  // A key pasted into Secret Manager often carries a trailing newline.
  const apiKey = (env.ANTHROPIC_API_KEY || '').trim();
  const ruleId = (env.ANTHROPIC_FEDERATION_RULE_ID || '').trim();
  if (ruleId && apiKey) {
    // The SDK prefers a key over credentials, so a forgotten secret would win silently.
    throw new Error('set ANTHROPIC_FEDERATION_RULE_ID or ANTHROPIC_API_KEY, not both');
  }
  if (apiKey) return { mode: 'key', options: { apiKey } };
  if (!ruleId) throw new Error('AI_PROVIDER=anthropic needs ANTHROPIC_FEDERATION_RULE_ID or ANTHROPIC_API_KEY');

  const organizationId = (env.ANTHROPIC_ORGANIZATION_ID || '').trim();
  if (!organizationId) throw new Error('federation needs ANTHROPIC_ORGANIZATION_ID');
  const credentials = oidcFederationProvider({
    identityTokenProvider: googleIdentityToken(fetchFn),
    federationRuleId: ruleId,
    organizationId,
    serviceAccountId: env.ANTHROPIC_SERVICE_ACCOUNT_ID || undefined,
    workspaceId: env.ANTHROPIC_WORKSPACE_ID || undefined,
    baseURL: ANTHROPIC_BASE_URL,
    fetch: fetchFn,
  });
  return { mode: 'federation', options: { apiKey: null, credentials } };
}
