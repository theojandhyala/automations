export interface AppStoreCredentials {
  issuer_id: string;
  key_id: string;
  private_key: string;
}

interface AppleResource<T = Record<string, unknown>> {
  id: string;
  type: string;
  attributes?: T;
  relationships?: Record<string, unknown>;
}

interface AppleResponse<T = Record<string, unknown>> {
  data: AppleResource<T> | Array<AppleResource<T>>;
  included?: Array<AppleResource>;
  errors?: Array<{ title?: string; detail?: string; code?: string }>;
}

const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function pemToBytes(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  if (!body) throw new Error('The App Store Connect .p8 private key is empty or malformed.');
  try {
    const binary = atob(body);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error('The App Store Connect .p8 private key is not valid base64.');
  }
}

/** Creates Apple's short-lived ES256 JWT entirely inside the Worker. */
export async function appStoreToken(credentials: AppStoreCredentials): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBytes(credentials.private_key),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'ES256', kid: credentials.key_id, typ: 'JWT' })));
  const payload = base64Url(encoder.encode(JSON.stringify({
    iss: credentials.issuer_id,
    iat: now - 5,
    exp: now + 10 * 60,
    aud: 'appstoreconnect-v1',
  })));
  const signingInput = `${header}.${payload}`;
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(signingInput),
  ));
  if (signature.length !== 64) throw new Error('The runtime returned an invalid ES256 signature.');
  return `${signingInput}.${base64Url(signature)}`;
}

export class AppStoreApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function appStoreRequest<T = Record<string, unknown>>(
  credentials: AppStoreCredentials,
  path: string,
  init: RequestInit = {},
): Promise<AppleResponse<T>> {
  const token = await appStoreToken(credentials);
  const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as AppleResponse<T>;
  if (!response.ok) {
    const first = body.errors?.[0];
    const detail = first?.detail ?? first?.title ?? `App Store Connect request failed (${response.status}).`;
    throw new AppStoreApiError(detail, response.status);
  }
  return body;
}

export async function listAppStoreApps(credentials: AppStoreCredentials) {
  const response = await appStoreRequest<{ name?: string; bundleId?: string }>(
    credentials,
    '/v1/apps?fields%5Bapps%5D=name%2CbundleId&limit=200',
  );
  return (Array.isArray(response.data) ? response.data : []).map((app) => ({
    id: app.id,
    name: app.attributes?.name ?? 'Unnamed app',
    bundle_id: app.attributes?.bundleId ?? '',
  }));
}

export async function listAppSubscriptions(credentials: AppStoreCredentials, appId: string) {
  const query = new URLSearchParams({
    include: 'subscriptions',
    'fields[subscriptionGroups]': 'referenceName',
    'fields[subscriptions]': 'name,productId,state',
    limit: '200',
    'limit[subscriptions]': '50',
  });
  const response = await appStoreRequest(credentials, `/v1/apps/${encodeURIComponent(appId)}/subscriptionGroups?${query}`);
  const groups = Array.isArray(response.data) ? response.data : [];
  const subscriptions = (response.included ?? []).filter((item) => item.type === 'subscriptions');
  return {
    groups: groups.map((group) => ({
      id: group.id,
      name: String(group.attributes?.referenceName ?? 'Subscription group'),
    })),
    subscriptions: subscriptions.map((subscription) => ({
      id: subscription.id,
      name: String(subscription.attributes?.name ?? subscription.attributes?.productId ?? 'Subscription'),
      product_id: String(subscription.attributes?.productId ?? ''),
      state: String(subscription.attributes?.state ?? ''),
    })),
  };
}

export async function listSubscriptionOffers(credentials: AppStoreCredentials, subscriptionId: string) {
  const query = new URLSearchParams({
    'fields[subscriptionOfferCodes]': 'name,active,duration,offerMode,numberOfPeriods,totalNumberOfCodes',
    limit: '200',
  });
  const response = await appStoreRequest(credentials, `/v1/subscriptions/${encodeURIComponent(subscriptionId)}/offerCodes?${query}`);
  const offers = Array.isArray(response.data) ? response.data : [];
  return offers.map((offer) => ({
    id: offer.id,
    name: String(offer.attributes?.name ?? 'Offer'),
    active: Boolean(offer.attributes?.active),
    duration: String(offer.attributes?.duration ?? ''),
    mode: String(offer.attributes?.offerMode ?? ''),
    periods: Number(offer.attributes?.numberOfPeriods ?? 0),
    total_codes: Number(offer.attributes?.totalNumberOfCodes ?? 0),
  }));
}

export async function createCustomSubscriptionCode(
  credentials: AppStoreCredentials,
  input: { offerCodeId: string; customCode: string; numberOfCodes: number; expirationDate: string | null },
) {
  const response = await appStoreRequest<{
    customCode?: string;
    numberOfCodes?: number;
    expirationDate?: string | null;
    active?: boolean;
  }>(credentials, '/v1/subscriptionOfferCodeCustomCodes', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'subscriptionOfferCodeCustomCodes',
        attributes: {
          customCode: input.customCode,
          numberOfCodes: input.numberOfCodes,
          expirationDate: input.expirationDate,
        },
        relationships: {
          offerCode: {
            data: { type: 'subscriptionOfferCodes', id: input.offerCodeId },
          },
        },
      },
    }),
  });
  const resource = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!resource) throw new Error('Apple created the code but returned no resource.');
  return {
    id: resource.id,
    custom_code: String(resource.attributes?.customCode ?? input.customCode),
    redemption_limit: Number(resource.attributes?.numberOfCodes ?? input.numberOfCodes),
    expiration_date: resource.attributes?.expirationDate ?? input.expirationDate,
    active: Boolean(resource.attributes?.active ?? true),
  };
}
