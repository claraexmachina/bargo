// crypto.test.ts — end-to-end: client seals → service decrypts → exact bytes recovered.
// Uses @bargo/crypto seal + buildListingAad directly, then decryptReservationEphemeral.

import { buildListingAad, bytesToHex, generateServiceKeypair, hexToBytes, seal } from '@bargo/crypto';
import { describe, expect, it } from 'vitest';
import { decryptReservationEphemeral } from '../src/crypto/decryptEphemeral.js';

describe('decryptReservationEphemeral — end-to-end', () => {
  it('recovers exact plaintext after client seal', () => {
    const { privkey: serviceDecryptSk, pubkey: servicePubkey } = generateServiceKeypair();
    const listingId = `0x${'a1'.repeat(32)}` as `0x${string}`;
    const aad = buildListingAad(listingId);

    const minSell = '800000000000000000'; // 0.8 ETH in wei
    const maxBuy = '950000000000000000';
    const sellerText = '강남, 주말 오후 2-8시, 현금 또는 이체';
    const buyerText = 'Gangnam or Songpa, weekends 10-18h, cash';

    // Client-side seal
    const encMinSell = seal({
      recipientPubkey: servicePubkey,
      plaintext: new TextEncoder().encode(minSell),
      aad,
    });
    const encMaxBuy = seal({
      recipientPubkey: servicePubkey,
      plaintext: new TextEncoder().encode(maxBuy),
      aad,
    });
    const encSellerConditions = seal({
      recipientPubkey: servicePubkey,
      plaintext: new TextEncoder().encode(sellerText),
      aad,
    });
    const encBuyerConditions = seal({
      recipientPubkey: servicePubkey,
      plaintext: new TextEncoder().encode(buyerText),
      aad,
    });

    // Service-side decrypt
    const result = decryptReservationEphemeral({
      serviceDecryptSk,
      listingId,
      encMinSell,
      encSellerConditions,
      encMaxBuy,
      encBuyerConditions,
    });

    expect(result.minSellWei).toBe(BigInt(minSell));
    expect(result.maxBuyWei).toBe(BigInt(maxBuy));
    expect(result.sellerConditions).toBe(sellerText);
    expect(result.buyerConditions).toBe(buyerText);
  });

  it('throws on wrong key', () => {
    const { pubkey: servicePubkey } = generateServiceKeypair();
    const { privkey: wrongSk } = generateServiceKeypair();
    const listingId = `0x${'bb'.repeat(32)}` as `0x${string}`;
    const aad = buildListingAad(listingId);

    const encMinSell = seal({
      recipientPubkey: servicePubkey,
      plaintext: new TextEncoder().encode('1000'),
      aad,
    });
    const encMaxBuy = seal({
      recipientPubkey: servicePubkey,
      plaintext: new TextEncoder().encode('2000'),
      aad,
    });
    const encSeller = seal({
      recipientPubkey: servicePubkey,
      plaintext: new TextEncoder().encode('cond'),
      aad,
    });
    const encBuyer = seal({
      recipientPubkey: servicePubkey,
      plaintext: new TextEncoder().encode('cond'),
      aad,
    });

    expect(() =>
      decryptReservationEphemeral({
        serviceDecryptSk: wrongSk,
        listingId,
        encMinSell,
        encSellerConditions: encSeller,
        encMaxBuy,
        encBuyerConditions: encBuyer,
      }),
    ).toThrow();
  });
});
