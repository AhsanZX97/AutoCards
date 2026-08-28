/**
 * Talks to the Android Publisher API as the service account this project's
 * Play Console access was granted to.
 *
 * Untested by design, like `stripe.ts` next to it: this is thin glue over an
 * HTTP API and Web Crypto, not a decision. What a response *means* — which
 * states entitle, which plan a product id sells — lives in `playBilling.ts`
 * instead, where it can be tested without a live Google credential.
 */

/** `app.autocards.mobile` in every environment — there is only ever one Play listing. */
const PACKAGE_NAME = 'app.autocards.mobile';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_ROOT = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

function serviceAccount(): ServiceAccountKey {
  const raw = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  if (!raw) throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not set on this project');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON');
  }
  const key = parsed as Partial<ServiceAccountKey>;
  if (!key.client_email || !key.private_key) {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is missing client_email or private_key');
  }
  return { client_email: key.client_email, private_key: key.private_key };
}

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importSigningKey(pem: string): Promise<CryptoKey> {
  const contents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(contents), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/**
 * A short-lived OAuth2 access token for the Android Publisher API, minted
 * from a self-signed JWT — the standard "server to server" flow for a Google
 * service account, since there is no user here to redirect through consent.
 */
async function accessToken(): Promise<string> {
  const account = serviceAccount();
  const key = await importSigningKey(account.private_key);

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = base64url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: account.client_email,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const signature = base64url(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`)),
  );
  const assertion = `${header}.${claims}.${signature}`;

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error(`Could not get a Google access token: ${response.status} ${await response.text()}`);
  }
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error('Google token response carried no access_token');
  return payload.access_token;
}

async function callApi(path: string): Promise<unknown> {
  const token = await accessToken();
  const response = await fetch(`${API_ROOT}/${PACKAGE_NAME}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Android Publisher API refused the request: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

/** The live state of a subscription purchase, straight from Google. */
export function getSubscriptionPurchase(purchaseToken: string): Promise<unknown> {
  return callApi(`purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`);
}

/** The live state of a one-time product purchase, straight from Google. */
export function getOneTimeProductPurchase(productId: string, purchaseToken: string): Promise<unknown> {
  return callApi(
    `purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`,
  );
}
