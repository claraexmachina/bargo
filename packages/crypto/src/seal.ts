import type { EncryptedBlob, Hex } from '@haggle/shared';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { ENVELOPE_VERSION } from '@haggle/shared';

function hexToBytes(hex: Hex): Uint8Array {
  const raw = hex.slice(2);
  const bytes = new Uint8Array(raw.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): Hex {
  let hex = '';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return `0x${hex}`;
}

// Derive 32-byte symmetric key from X25519 shared secret via HKDF-SHA256.
// salt = ephPub || teePub (64 bytes), info = "haggle-v1"
function deriveKey(shared: Uint8Array, ephPub: Uint8Array, teePub: Uint8Array): Uint8Array {
  const salt = new Uint8Array(ephPub.length + teePub.length);
  salt.set(ephPub, 0);
  salt.set(teePub, ephPub.length);
  return hkdf(sha256, shared, salt, 'haggle-v1', 32);
}

export interface SealParams {
  // 32-byte X25519 public key of the TEE enclave, hex-encoded
  teePubkey: Hex;
  // plaintext bytes to encrypt
  plaintext: Uint8Array;
  // additional authenticated data: listingId (32b) || offerId (32b), 64 bytes total
  // If offerId is not yet known (listing creation), use 64 zero bytes
  aad: Uint8Array;
}

export function seal({ teePubkey, plaintext, aad }: SealParams): EncryptedBlob {
  const teePub = hexToBytes(teePubkey);
  const ephSk = randomBytes(32);
  const ephPub = x25519.getPublicKey(ephSk);
  const shared = x25519.getSharedSecret(ephSk, teePub);
  const key = deriveKey(shared, ephPub, teePub);
  const nonce = randomBytes(24);
  const cipher = xchacha20poly1305(key, nonce, aad);
  const ct = cipher.encrypt(plaintext);

  return {
    v: ENVELOPE_VERSION,
    ephPub: bytesToHex(ephPub),
    nonce: bytesToHex(nonce),
    ct: bytesToHex(ct),
  };
}
