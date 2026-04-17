import { buildListingAad, seal } from '@bargo/crypto';
import type { EncryptedBlob, Hex, ListingId } from '@bargo/shared';

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
