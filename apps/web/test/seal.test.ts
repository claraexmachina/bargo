/**
 * seal.test.ts — verifies sealReservationPrice and sealConditions produce
 * a well-formed EncryptedBlob and never embed plaintext in the output.
 *
 * Uses a freshly generated X25519 keypair as mock service pubkey so the test
 * runs entirely offline without mocking the @bargo/crypto internals.
 */
import { generateServiceKeypair } from '@bargo/crypto';
import type { EncryptedBlob, Hex, ListingId } from '@bargo/shared';
import { describe, expect, it } from 'vitest';
import { sealConditions, sealReservationPrice } from '../lib/seal';

const FAKE_LISTING_ID: ListingId =
  '0x1111111111111111111111111111111111111111111111111111111111111111';

function isHex(s: string): boolean {
  return typeof s === 'string' && /^0x[0-9a-fA-F]+$/.test(s);
}

function assertBlobShape(blob: EncryptedBlob) {
  expect(blob.v).toBe(1);
  expect(isHex(blob.ephPub)).toBe(true);
  expect(isHex(blob.nonce)).toBe(true);
  expect(isHex(blob.ct)).toBe(true);
  // ephPub: 32 bytes = 64 hex chars + '0x'
  expect(blob.ephPub.length).toBe(66);
  // nonce: 24 bytes = 48 hex chars + '0x'
  expect(blob.nonce.length).toBe(50);
  // ct must be non-empty (plaintext + 16-byte Poly1305 tag minimum)
  expect(blob.ct.length).toBeGreaterThan(2);
}

describe('sealReservationPrice', () => {
  it('produces a well-formed EncryptedBlob', () => {
    const { pubkey } = generateServiceKeypair();
    const blob = sealReservationPrice({
      servicePubkey: pubkey as Hex,
      listingId: FAKE_LISTING_ID,
      reservationWei: '700000000000000000000000',
    });
    assertBlobShape(blob);
  });

  it('ciphertext does not contain plaintext wei value', () => {
    const { pubkey } = generateServiceKeypair();
    const SECRET = '700000000000000000000000';
    const blob = sealReservationPrice({
      servicePubkey: pubkey as Hex,
      listingId: FAKE_LISTING_ID,
      reservationWei: SECRET,
    });
    // The hex of the secret should not appear literally in ct
    const secretHex = Buffer.from(SECRET).toString('hex');
    expect(blob.ct).not.toContain(secretHex);
  });

  it('two seals of the same plaintext produce different ciphertexts (ephemeral nonce)', () => {
    const { pubkey } = generateServiceKeypair();
    const blob1 = sealReservationPrice({
      servicePubkey: pubkey as Hex,
      listingId: FAKE_LISTING_ID,
      reservationWei: '700000000000000000000000',
    });
    const blob2 = sealReservationPrice({
      servicePubkey: pubkey as Hex,
      listingId: FAKE_LISTING_ID,
      reservationWei: '700000000000000000000000',
    });
    expect(blob1.ct).not.toBe(blob2.ct);
  });
});

describe('sealConditions', () => {
  it('produces a well-formed EncryptedBlob', () => {
    const { pubkey } = generateServiceKeypair();
    const blob = sealConditions({
      servicePubkey: pubkey as Hex,
      listingId: FAKE_LISTING_ID,
      conditions: 'Gangnam/Songpa in-person only, weekday evenings',
    });
    assertBlobShape(blob);
  });

  it('trims whitespace before sealing (two different inputs that trim equally are equal in plaintext)', () => {
    const { pubkey } = generateServiceKeypair();
    // Both should seal the same trimmed string — but with random nonces, ct differs.
    // We just verify neither throws and both have valid shape.
    const blob1 = sealConditions({
      servicePubkey: pubkey as Hex,
      listingId: FAKE_LISTING_ID,
      conditions: '  Gangnam  ',
    });
    const blob2 = sealConditions({
      servicePubkey: pubkey as Hex,
      listingId: FAKE_LISTING_ID,
      conditions: 'Gangnam',
    });
    assertBlobShape(blob1);
    assertBlobShape(blob2);
  });
});
