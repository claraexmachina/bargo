/**
 * RLN proof stub structure test.
 * Verifies output matches the interface RLNProof from @bargo/shared.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { RLNProof } from '@bargo/shared';
import { RLN_EPOCH_DURATION } from '@bargo/shared';

// Provide localStorage stub for jsdom
const storage: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (k: string) => storage[k] ?? null,
  setItem: (k: string, v: string) => { storage[k] = v; },
  removeItem: (k: string) => { delete storage[k]; },
  clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
  length: 0,
  key: () => null,
};

// crypto.getRandomValues stub
if (!globalThis.crypto) {
  // @ts-expect-error -- node crypto
  globalThis.crypto = await import('node:crypto').then(m => m.webcrypto);
}

const { buildRLNProof } = await import('../lib/rln.js');

const LISTING_ID = '0x1111111111111111111111111111111111111111111111111111111111111111' as const;

describe('buildRLNProof', () => {
  beforeEach(() => {
    storage['rln_sk_0xabc'] = undefined as unknown as string;
    delete storage['rln_sk_0xabc'];
  });

  it('returns correct RLNProof shape', () => {
    const proof = buildRLNProof({
      listingId: LISTING_ID,
      bidPriceWei: 750_000n * 10n ** 18n,
      walletAddress: '0xABC',
    });

    // Type-check: all fields present
    const _: RLNProof = proof;

    expect(proof.epoch).toBeTypeOf('number');
    expect(proof.epoch).toBeGreaterThan(0);
    expect(proof.proof).toMatch(/^0x[0-9a-f]{64}$/);
    expect(proof.nullifier).toMatch(/^0x[0-9a-f]{64}$/);
    expect(proof.signalHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(proof.rlnIdentityCommitment).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('epoch matches current time / EPOCH_DURATION', () => {
    const proof = buildRLNProof({
      listingId: LISTING_ID,
      bidPriceWei: 1n,
      walletAddress: '0xABC',
    });
    const expectedEpoch = Math.floor(Date.now() / 1000 / RLN_EPOCH_DURATION);
    expect(proof.epoch).toBe(expectedEpoch);
  });

  it('same wallet produces same nullifier in same epoch', () => {
    const opts = { listingId: LISTING_ID, bidPriceWei: 1n, walletAddress: '0xSAME' };
    const a = buildRLNProof(opts);
    const b = buildRLNProof(opts);
    expect(a.nullifier).toBe(b.nullifier);
  });

  it('different wallets produce different nullifiers', () => {
    const a = buildRLNProof({ listingId: LISTING_ID, bidPriceWei: 1n, walletAddress: '0xAAA' });
    const b = buildRLNProof({ listingId: LISTING_ID, bidPriceWei: 1n, walletAddress: '0xBBB' });
    expect(a.nullifier).not.toBe(b.nullifier);
  });
});
