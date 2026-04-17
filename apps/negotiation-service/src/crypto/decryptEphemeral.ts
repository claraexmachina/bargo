import { buildListingAad, open } from '@bargo/crypto';
import type { EncryptedBlob, Hex, ListingId } from '@bargo/shared';

export interface DecryptedReservation {
  minSellWei: bigint;
  maxBuyWei: bigint;
  sellerConditions: string;
  buyerConditions: string;
}

/**
 * Decrypts all four blobs for a negotiation in a single call.
 * Plaintext exists only in the returned object's memory — callers MUST
 * clear references ASAP after passing into NEAR AI and never log the result.
 */
export function decryptReservationEphemeral(opts: {
  serviceDecryptSk: Hex;
  listingId: ListingId;
  encMinSell: EncryptedBlob;
  encSellerConditions: EncryptedBlob;
  encMaxBuy: EncryptedBlob;
  encBuyerConditions: EncryptedBlob;
}): DecryptedReservation {
  const aad = buildListingAad(opts.listingId);
  const dec = (blob: EncryptedBlob): string =>
    new TextDecoder().decode(open({ recipientPrivkey: opts.serviceDecryptSk, blob, aad }));
  return {
    minSellWei: BigInt(dec(opts.encMinSell)),
    maxBuyWei: BigInt(dec(opts.encMaxBuy)),
    sellerConditions: dec(opts.encSellerConditions),
    buyerConditions: dec(opts.encBuyerConditions),
  };
}
