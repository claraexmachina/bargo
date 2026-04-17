// Bargo encryption envelope (X25519 ECDH → HKDF-SHA256 → XChaCha20-Poly1305).
// Clients seal reservation data to the service's attested pubkey.
// Service decrypts only in ephemeral request-scope memory (never logged,
// never persisted in plaintext) and immediately forwards to NEAR AI TEE.

import type { EncryptedBlob, Hex } from '@bargo/shared';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';

export function hexToBytes(hex: Hex): Uint8Array {
  const raw = hex.slice(2);
  const bytes = new Uint8Array(raw.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): Hex {
  let hex = '';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return `0x${hex}`;
}

// Derive 32-byte symmetric key from X25519 shared secret via HKDF-SHA256.
// salt = ephPub || recipientPub (64 bytes), info = "bargo-v1"
function deriveKey(shared: Uint8Array, ephPub: Uint8Array, recipientPub: Uint8Array): Uint8Array {
  const salt = new Uint8Array(ephPub.length + recipientPub.length);
  salt.set(ephPub, 0);
  salt.set(recipientPub, ephPub.length);
  return hkdf(sha256, shared, salt, 'bargo-v1', 32);
}

// All blob types use AAD = listingId (32 bytes). Offer-side binding to a
// specific offerId is enforced at the REST transport layer (server-side),
// not inside AEAD — see docs/threat-model.md §AAD.
export function buildListingAad(listingId: Hex): Uint8Array {
  return hexToBytes(listingId);
}

export interface SealParams {
  recipientPubkey: Hex; // 32-byte X25519 pubkey (service)
  plaintext: Uint8Array;
  aad: Uint8Array;
}

export interface OpenParams {
  recipientPrivkey: Hex; // 32-byte X25519 private key (service-side)
  blob: EncryptedBlob;
  aad: Uint8Array;
}

export function seal(params: SealParams): EncryptedBlob {
  const recipientPub = hexToBytes(params.recipientPubkey);
  const ephSk = x25519.utils.randomPrivateKey();
  const ephPub = x25519.getPublicKey(ephSk);
  const shared = x25519.getSharedSecret(ephSk, recipientPub);
  const key = deriveKey(shared, ephPub, recipientPub);
  const nonce = randomBytes(24);
  const cipher = xchacha20poly1305(key, nonce, params.aad);
  const ct = cipher.encrypt(params.plaintext);
  return {
    v: 1,
    ephPub: bytesToHex(ephPub),
    nonce: bytesToHex(nonce),
    ct: bytesToHex(ct),
  };
}

export function open(params: OpenParams): Uint8Array {
  if (params.blob.v !== 1) {
    throw new Error(`Unsupported envelope version: ${params.blob.v}`);
  }
  const recipientSk = hexToBytes(params.recipientPrivkey);
  const ephPub = hexToBytes(params.blob.ephPub);
  const nonce = hexToBytes(params.blob.nonce);
  const ct = hexToBytes(params.blob.ct);
  const shared = x25519.getSharedSecret(recipientSk, ephPub);
  const recipientPub = x25519.getPublicKey(recipientSk);
  const key = deriveKey(shared, ephPub, recipientPub);
  const cipher = xchacha20poly1305(key, nonce, params.aad);
  return cipher.decrypt(ct);
}

// Service uses this once at provisioning to generate its long-term keypair.
export function generateServiceKeypair(): { privkey: Hex; pubkey: Hex } {
  const sk = x25519.utils.randomPrivateKey();
  const pk = x25519.getPublicKey(sk);
  return { privkey: bytesToHex(sk), pubkey: bytesToHex(pk) };
}
