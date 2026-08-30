import { afterEach, describe, expect, it, vi } from 'vitest';
import { appStoreToken, createCustomSubscriptionCode } from '../src/lib/app-store';
import { jsonResponse } from './helpers';

afterEach(() => vi.unstubAllGlobals());

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function credentials() {
  const keys = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair;
  const exported = await crypto.subtle.exportKey('pkcs8', keys.privateKey) as ArrayBuffer;
  const pkcs8 = new Uint8Array(exported);
  const body = bytesToBase64(pkcs8).match(/.{1,64}/g)?.join('\n') ?? '';
  return {
    issuer_id: '57246542-96fe-1a63-e053-0824d011072a',
    key_id: 'ABC123DEFG',
    private_key: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`,
  };
}

describe('App Store Connect', () => {
  it('creates a short-lived ES256 JWT with Apple claims', async () => {
    const token = await appStoreToken(await credentials());
    const [header, payload, signature] = token.split('.');
    const decode = (value: string) => JSON.parse(atob(value.replace(/-/g, '+').replace(/_/g, '/')));
    expect(decode(header!)).toMatchObject({ alg: 'ES256', kid: 'ABC123DEFG' });
    expect(decode(payload!)).toMatchObject({
      iss: '57246542-96fe-1a63-e053-0824d011072a',
      aud: 'appstoreconnect-v1',
    });
    expect(signature).toBeTruthy();
  });

  it('sends the exact Apple custom-code request shape', async () => {
    let body: unknown = null;
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return jsonResponse({
        data: {
          id: 'apple-code-id',
          type: 'subscriptionOfferCodeCustomCodes',
          attributes: { customCode: 'DEADSETVIP', numberOfCodes: 1, expirationDate: null, active: true },
        },
      }, 201);
    });

    const result = await createCustomSubscriptionCode(await credentials(), {
      offerCodeId: 'offer-id',
      customCode: 'DEADSETVIP',
      numberOfCodes: 1,
      expirationDate: null,
    });

    expect(body).toMatchObject({
      data: {
        type: 'subscriptionOfferCodeCustomCodes',
        attributes: { customCode: 'DEADSETVIP', numberOfCodes: 1, expirationDate: null },
        relationships: { offerCode: { data: { type: 'subscriptionOfferCodes', id: 'offer-id' } } },
      },
    });
    expect(result).toMatchObject({ id: 'apple-code-id', custom_code: 'DEADSETVIP', redemption_limit: 1 });
  });
});
