// open.ts — for test use only.
// The TEE uses the Python equivalent in services/tee/haggle_tee/crypto.py.
// Do not import this module in production application code.

import type { EncryptedBlob, Hex } from '@haggle/shared';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';

function hexToBytes(hex: Hex): Uint8Array {
  const raw = hex.slice(2);
  const bytes = new Uint8Array(raw.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export interface OpenParams {
  // 32-byte X25519 private key of the TEE enclave, hex-encoded
  privateKey: Hex;
  blob: EncryptedBlob;
  // must match the aad used during seal
  aad: Uint8Array;
}

export function open({ privateKey, blob, aad }: OpenParams): Uint8Array {
  const sk = hexToBytes(privateKey);
  const ephPub = hexToBytes(blob.ephPub);
  const nonce = hexToBytes(blob.nonce);
  const ct = hexToBytes(blob.ct);

  const teePub = x25519.getPublicKey(sk);
  const shared = x25519.getSharedSecret(sk, ephPub);

  const salt = new Uint8Array(ephPub.length + teePub.length);
  salt.set(ephPub, 0);
  salt.set(teePub, ephPub.length);
  const key = hkdf(sha256, shared, salt, 'haggle-v1', 32);

  const cipher = xchacha20poly1305(key, nonce, aad);
  return cipher.decrypt(ct);
}
