import { seal } from '@haggle/crypto';
import type { EncryptedBlob, Hex, ListingId, OfferId } from '@haggle/shared';

const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;

function hexToBytes(hex: Hex): Uint8Array {
  const raw = hex.slice(2);
  const bytes = new Uint8Array(raw.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function buildAad(listingId: Hex, offerId: Hex): Uint8Array {
  const aad = new Uint8Array(64);
  aad.set(hexToBytes(listingId), 0);
  aad.set(hexToBytes(offerId), 32);
  return aad;
}

/**
 * Encrypt a reservation price (wei decimal string) to TEE pubkey.
 * offerId should be ZERO_BYTES32 when sealing for listing creation.
 */
export function sealPrice(
  teePubkey: Hex,
  weiString: string,
  listingId: ListingId,
  offerId: OfferId = ZERO_BYTES32 as OfferId,
): EncryptedBlob {
  const plaintext = new TextEncoder().encode(weiString);
  const aad = buildAad(listingId, offerId);
  return seal({ teePubkey, plaintext, aad });
}

/**
 * Encrypt a natural-language conditions string to TEE pubkey.
 * Max 2 KB enforced here as a runtime guard (UI also enforces).
 */
export function sealConditions(
  teePubkey: Hex,
  conditionsText: string,
  listingId: ListingId,
  offerId: OfferId = ZERO_BYTES32 as OfferId,
): EncryptedBlob {
  const trimmed = conditionsText.trim().slice(0, 2048);
  const plaintext = new TextEncoder().encode(trimmed);
  const aad = buildAad(listingId, offerId);
  return seal({ teePubkey, plaintext, aad });
}
