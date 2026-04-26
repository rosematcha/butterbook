import { getDb } from '../db/index.js';
import { decryptSecret } from '../utils/crypto.js';
import { hmacHex } from '../utils/ids.js';
import { getConfig } from '../config.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MICROSOFT_USERINFO_URL = 'https://graph.microsoft.com/oidc/userinfo';

export interface SsoProvider {
  id: string;
  orgId: string;
  provider: 'google' | 'microsoft';
  clientId: string;
  allowedDomains: string[];
  defaultRoleId: string | null;
  ssoRequired: boolean;
  enabled: boolean;
}

export interface SsoUserInfo {
  email: string;
  name: string | null;
  givenName: string | null;
  familyName: string | null;
}

function providerUrls(provider: 'google' | 'microsoft') {
  if (provider === 'google') return { authUrl: GOOGLE_AUTH_URL, tokenUrl: GOOGLE_TOKEN_URL, userinfoUrl: GOOGLE_USERINFO_URL };
  return { authUrl: MICROSOFT_AUTH_URL, tokenUrl: MICROSOFT_TOKEN_URL, userinfoUrl: MICROSOFT_USERINFO_URL };
}

export function makeSsoState(orgId: string, providerId: string, now = Date.now()): string {
  const payload = `${orgId}.${providerId}.${now}`;
  const mac = hmacHex(getConfig().SESSION_SECRET, payload);
  return `${payload}.${mac}`;
}

export function verifySsoState(state: string): { orgId: string; providerId: string } | null {
  const parts = state.split('.');
  if (parts.length !== 4) return null;
  const [orgId, providerId, tsStr, mac] = parts as [string, string, string, string];
  const ts = Number(tsStr);
  if (isNaN(ts) || Date.now() - ts > 10 * 60 * 1000) return null;
  const expected = hmacHex(getConfig().SESSION_SECRET, `${orgId}.${providerId}.${tsStr}`);
  if (mac !== expected) return null;
  return { orgId, providerId };
}

export function buildSsoRedirectUrl(
  provider: SsoProvider,
  clientSecret: string,
  callbackUrl: string,
  state: string,
): string {
  void clientSecret; // only used for token exchange
  const { authUrl } = providerUrls(provider.provider);
  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  return `${authUrl}?${params}`;
}

export async function exchangeSsoCode(
  provider: SsoProvider,
  code: string,
  callbackUrl: string,
): Promise<SsoUserInfo> {
  const clientSecret = decryptSecret(
    await getDb()
      .selectFrom('org_sso_providers')
      .select(['client_secret'])
      .where('id', '=', provider.id)
      .executeTakeFirstOrThrow()
      .then((r) => r.client_secret),
  );
  const { tokenUrl, userinfoUrl } = providerUrls(provider.provider);

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: provider.clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: callbackUrl,
    }),
  });
  if (!tokenRes.ok) throw new Error('SSO token exchange failed');
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) throw new Error('SSO token missing');

  const infoRes = await fetch(userinfoUrl, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!infoRes.ok) throw new Error('SSO userinfo fetch failed');
  const info = (await infoRes.json()) as Record<string, unknown>;

  const email = typeof info.email === 'string' ? info.email.toLowerCase().trim() : null;
  if (!email) throw new Error('SSO provider did not return an email');

  return {
    email,
    name: typeof info.name === 'string' ? info.name : null,
    givenName: typeof info.given_name === 'string' ? info.given_name : null,
    familyName: typeof info.family_name === 'string' ? info.family_name : null,
  };
}
