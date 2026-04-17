import type { EncryptedBlob } from '@haggle/shared';

// Envelope byte layout (PLAN §3.5):
// | offset | size | field              |
// |--------|------|--------------------|
// |   0    |  32  | ephPub  (X25519)   |
// |  32    |  24  | nonce   (XChaCha)  |
// |  56    |   N  | ciphertext+tag     |
// Tag (Poly1305, 16 bytes) is the trailing 16 bytes of the ciphertext field.

const EPH_PUB_OFFSET = 0;
const EPH_PUB_SIZE = 32;
const NONCE_OFFSET = 32;
const NONCE_SIZE = 24;
const CT_OFFSET = 56;

function hexToBytes(hex: `0x${string}`): Uint8Array {
  const raw = hex.slice(2);
  const bytes = new Uint8Array(raw.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let hex = '';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return `0x${hex}`;
}

export function serialize(blob: EncryptedBlob): Uint8Array {
  const ephPub = hexToBytes(blob.ephPub);
  const nonce = hexToBytes(blob.nonce);
  const ct = hexToBytes(blob.ct);

  if (ephPub.length !== EPH_PUB_SIZE) {
    throw new Error(`envelope: ephPub must be ${EPH_PUB_SIZE} bytes, got ${ephPub.length}`);
  }
  if (nonce.length !== NONCE_SIZE) {
    throw new Error(`envelope: nonce must be ${NONCE_SIZE} bytes, got ${nonce.length}`);
  }

  const out = new Uint8Array(CT_OFFSET + ct.length);
  out.set(ephPub, EPH_PUB_OFFSET);
  out.set(nonce, NONCE_OFFSET);
  out.set(ct, CT_OFFSET);
  return out;
}

export function parse(bytes: Uint8Array): EncryptedBlob {
  if (bytes.length < CT_OFFSET + 16) {
    throw new Error(`envelope: buffer too short (${bytes.length} bytes)`);
  }
  return {
    v: 1,
    ephPub: bytesToHex(bytes.slice(EPH_PUB_OFFSET, EPH_PUB_OFFSET + EPH_PUB_SIZE)),
    nonce: bytesToHex(bytes.slice(NONCE_OFFSET, NONCE_OFFSET + NONCE_SIZE)),
    ct: bytesToHex(bytes.slice(CT_OFFSET)),
  };
}
