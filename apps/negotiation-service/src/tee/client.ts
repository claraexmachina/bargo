// TEE HTTP client — calls services/tee over HTTPS.
// Timeout: 12s per PLAN §3.3.
// All enc* fields pass through opaquely; this service never decrypts them.

import type { TeeAttestation, GetTeePubkeyResponse, EncryptedBlob, ListingId, OfferId, KarmaTier } from '@haggle/shared';

export interface NegotiateRequest {
  listingId: ListingId;
  offerId: OfferId;
  nonce: `0x${string}`;
  listingMeta: { title: string; category: string };
  karmaTiers: { seller: KarmaTier; buyer: KarmaTier };
  encMinSell: EncryptedBlob;
  encSellerConditions: EncryptedBlob;
  encMaxBuy: EncryptedBlob;
  encBuyerConditions: EncryptedBlob;
}

export interface TeeClient {
  negotiate(req: NegotiateRequest): Promise<TeeAttestation>;
  getPubkey(): Promise<GetTeePubkeyResponse>;
  health(): Promise<{ ok: true; enclaveId: `0x${string}`; modelId: string }>;
}

const TEE_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`TEE ${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function post<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`TEE ${path} responded ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function get<T>(baseUrl: string, path: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`TEE GET ${path} responded ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export function createTeeClient(baseUrl: string): TeeClient {
  return {
    async negotiate(req) {
      return withTimeout(post<TeeAttestation>(baseUrl, '/negotiate', req), TEE_TIMEOUT_MS, 'negotiate');
    },
    async getPubkey() {
      return withTimeout(get<GetTeePubkeyResponse>(baseUrl, '/pubkey'), TEE_TIMEOUT_MS, 'getPubkey');
    },
    async health() {
      return withTimeout(
        get<{ ok: true; enclaveId: `0x${string}`; modelId: string }>(baseUrl, '/health'),
        TEE_TIMEOUT_MS,
        'health',
      );
    },
  };
}
