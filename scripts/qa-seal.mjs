// QA seal helper — produce EncryptedBlob payloads for endpoint testing.
//
// Usage (as a module, imported by qa-scenarios.mjs):
//   import { sealForListing, sealForOffer, sealText } from './qa-seal.mjs';
//
// All helpers take the TEE pubkey as hex and return an EncryptedBlob { v, ephPub, nonce, ct }.
// AAD follows the mock TEE contract:
//   - listing-only blobs (encMinSell, encSellerConditions): listingId || zeros(32)
//   - per-offer blobs (encMaxBuy, encBuyerConditions):       listingId || offerId

import { seal } from '@haggle/crypto';
import { hexToBytes } from 'viem';

function buildAad(listingIdHex, offerIdHex) {
  const aad = new Uint8Array(64);
  aad.set(hexToBytes(listingIdHex), 0);
  if (offerIdHex) {
    aad.set(hexToBytes(offerIdHex), 32);
  }
  return aad;
}

function encodeText(s) {
  return new TextEncoder().encode(s);
}

// For listing-side blobs — offerId unknown → zeros
export function sealForListing({ teePubkey, plaintext, listingId }) {
  return seal({
    teePubkey,
    plaintext: typeof plaintext === 'string' ? encodeText(plaintext) : plaintext,
    aad: buildAad(listingId, null),
  });
}

// For offer-side blobs — AAD uses listingId||offerId
export function sealForOffer({ teePubkey, plaintext, listingId, offerId }) {
  return seal({
    teePubkey,
    plaintext: typeof plaintext === 'string' ? encodeText(plaintext) : plaintext,
    aad: buildAad(listingId, offerId),
  });
}

// Generic
export function sealText({ teePubkey, text, aad }) {
  return seal({
    teePubkey,
    plaintext: encodeText(text),
    aad,
  });
}
