/**
 * Verifies that sealIntentMaxBuy / sealIntentConditions produce valid EncryptedBlob
 * envelopes that the service can open with the corresponding private key.
 *
 * Uses the same open() helper from @bargo/crypto.
 */
import { generateServiceKeypair, open } from '@bargo/crypto';
import { keccak256, toBytes } from 'viem';
import { describe, expect, it } from 'vitest';
import { sealIntentConditions, sealIntentMaxBuy } from '@/lib/seal';

function buildIntentAad(): Uint8Array {
  return toBytes(keccak256(new TextEncoder().encode('bargo-intent-v1')));
}

describe('sealIntentMaxBuy', () => {
  it('produces a v1 EncryptedBlob that decrypts to the original wei string', () => {
    const { privkey, pubkey } = generateServiceKeypair();
    const maxBuyWei = '1500000000000000000'; // 1.5 ETH in wei

    const blob = sealIntentMaxBuy({ servicePubkey: pubkey, maxBuyWei });

    expect(blob.v).toBe(1);
    expect(blob.ephPub).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(blob.nonce).toMatch(/^0x[0-9a-f]{48}$/i);

    const plaintext = open({ recipientPrivkey: privkey, blob, aad: buildIntentAad() });
    expect(new TextDecoder().decode(plaintext)).toBe(maxBuyWei);
  });
});

describe('sealIntentConditions', () => {
  it('produces a v1 EncryptedBlob that decrypts to the trimmed conditions string', () => {
    const { privkey, pubkey } = generateServiceKeypair();
    const conditions = '  Seoul preferred, weekends only  ';

    const blob = sealIntentConditions({ servicePubkey: pubkey, conditions });

    const plaintext = open({ recipientPrivkey: privkey, blob, aad: buildIntentAad() });
    expect(new TextDecoder().decode(plaintext)).toBe(conditions.trim());
  });

  it('uses a different AAD context from listing-scoped seal — cross-context decrypt fails', () => {
    const { privkey, pubkey } = generateServiceKeypair();
    const blob = sealIntentConditions({ servicePubkey: pubkey, conditions: 'test' });

    // Wrong AAD (all-zero listing AAD) — should throw
    const wrongAad = new Uint8Array(32);
    expect(() => open({ recipientPrivkey: privkey, blob, aad: wrongAad })).toThrow();
  });
});
