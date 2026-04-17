import { seal, buildListingAad } from '@haggle/crypto';
import type { EncryptedBlob, Hex, ListingId } from '@haggle/shared';

/**
 * Encrypt a reservation price (wei decimal string) to TEE pubkey.
 * AAD = listingId (32 bytes). offerId is authenticated at the REST
 * transport boundary, not inside AEAD. See PLAN §3.5.
 */
export function sealPrice(
  teePubkey: Hex,
  weiString: string,
  listingId: ListingId,
): EncryptedBlob {
  const plaintext = new TextEncoder().encode(weiString);
  const aad = buildListingAad(listingId);
  return seal({ teePubkey, plaintext, aad });
}

/**
 * Encrypt a natural-language conditions string to TEE pubkey.
 * Max 2 KB enforced here as a runtime guard (UI also enforces).
 * AAD = listingId (32 bytes). See PLAN §3.5.
 */
export function sealConditions(
  teePubkey: Hex,
  conditionsText: string,
  listingId: ListingId,
): EncryptedBlob {
  const trimmed = conditionsText.trim().slice(0, 2048);
  const plaintext = new TextEncoder().encode(trimmed);
  const aad = buildListingAad(listingId);
  return seal({ teePubkey, plaintext, aad });
}
