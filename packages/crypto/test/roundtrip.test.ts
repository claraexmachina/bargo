import { describe, expect, it } from 'vitest';
import { buildListingAad, generateServiceKeypair, open, seal } from '../src/envelope.js';

const LISTING_ID = '0x1111111111111111111111111111111111111111111111111111111111111111' as const;

describe('seal / open roundtrip', () => {
  it('recovers the plaintext exactly', () => {
    const { privkey, pubkey } = generateServiceKeypair();
    const aad = buildListingAad(LISTING_ID);
    const plaintext = new TextEncoder().encode('700000000000000000000000');

    const blob = seal({ recipientPubkey: pubkey, plaintext, aad });
    const recovered = open({ recipientPrivkey: privkey, blob, aad });

    expect(new TextDecoder().decode(recovered)).toBe('700000000000000000000000');
  });

  it('rejects tampered ciphertext', () => {
    const { privkey, pubkey } = generateServiceKeypair();
    const aad = buildListingAad(LISTING_ID);
    const plaintext = new TextEncoder().encode('strictly private');

    const blob = seal({ recipientPubkey: pubkey, plaintext, aad });
    const tampered = { ...blob, ct: (`${blob.ct.slice(0, -2)}ff`) as `0x${string}` };

    expect(() => open({ recipientPrivkey: privkey, blob: tampered, aad })).toThrow();
  });

  it('rejects wrong AAD', () => {
    const { privkey, pubkey } = generateServiceKeypair();
    const plaintext = new TextEncoder().encode('strictly private');
    const blob = seal({
      recipientPubkey: pubkey,
      plaintext,
      aad: buildListingAad(LISTING_ID),
    });
    const otherListing =
      '0x2222222222222222222222222222222222222222222222222222222222222222' as const;

    expect(() =>
      open({ recipientPrivkey: privkey, blob, aad: buildListingAad(otherListing) }),
    ).toThrow();
  });

  it('rejects wrong key', () => {
    const { pubkey } = generateServiceKeypair();
    const { privkey: otherSk } = generateServiceKeypair();
    const aad = buildListingAad(LISTING_ID);
    const plaintext = new TextEncoder().encode('strictly private');

    const blob = seal({ recipientPubkey: pubkey, plaintext, aad });

    expect(() => open({ recipientPrivkey: otherSk, blob, aad })).toThrow();
  });
});
