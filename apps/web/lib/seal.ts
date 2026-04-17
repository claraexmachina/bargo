import { buildListingAad, seal } from '@bargo/crypto';
import type { EncryptedBlob, Hex, ListingId } from '@bargo/shared';
import { sha256 } from '@noble/hashes/sha256';

export function sealReservationPrice(opts: {
  servicePubkey: Hex;
  listingId: ListingId;
  reservationWei: string; // decimal wei
}): EncryptedBlob {
  return seal({
    recipientPubkey: opts.servicePubkey,
    plaintext: new TextEncoder().encode(opts.reservationWei),
    aad: buildListingAad(opts.listingId),
  });
}

export function sealConditions(opts: {
  servicePubkey: Hex;
  listingId: ListingId;
  conditions: string;
}): EncryptedBlob {
  return seal({
    recipientPubkey: opts.servicePubkey,
    plaintext: new TextEncoder().encode(opts.conditions.trim()),
    aad: buildListingAad(opts.listingId),
  });
}

// Intent context AAD — matches service-side constant (NOT tied to a listing).
// keccak256('bargo-intent-v1') — we use sha256 here as a stand-in since the
// crypto package doesn't expose keccak; the service must match this derivation.
function buildIntentAad(): Uint8Array {
  return sha256(new TextEncoder().encode('bargo-intent-v1'));
}

export function sealIntentMaxBuy(opts: {
  servicePubkey: Hex;
  maxBuyWei: string;
}): EncryptedBlob {
  return seal({
    recipientPubkey: opts.servicePubkey,
    plaintext: new TextEncoder().encode(opts.maxBuyWei),
    aad: buildIntentAad(),
  });
}

export function sealIntentConditions(opts: {
  servicePubkey: Hex;
  conditions: string;
}): EncryptedBlob {
  return seal({
    recipientPubkey: opts.servicePubkey,
    plaintext: new TextEncoder().encode(opts.conditions.trim()),
    aad: buildIntentAad(),
  });
}
