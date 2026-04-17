import { describe, expect, it } from 'vitest';
import { x25519 } from '@noble/curves/ed25519';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { open } from '../src/open.js';
import { seal } from '../src/seal.js';
import { parse, serialize } from '../src/envelope.js';
import type { Hex } from '@haggle/shared';
import goldenFixture from './fixtures/golden-envelope.json' assert { type: 'json' };

function bytesToHex(b: Uint8Array): Hex {
  return `0x${Array.from(b)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')}`;
}

function makeAad(listingId: Hex, offerId: Hex): Uint8Array {
  function hexToBytes(h: Hex): Uint8Array {
    const raw = h.slice(2);
    const b = new Uint8Array(raw.length / 2);
    for (let i = 0; i < b.length; i++) {
      b[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
    }
    return b;
  }
  const aad = new Uint8Array(64);
  aad.set(hexToBytes(listingId), 0);
  aad.set(hexToBytes(offerId), 32);
  return aad;
}

describe('seal / open roundtrip', () => {
  it('seals and opens a price plaintext', () => {
    const teeSk = randomBytes(32);
    const teePk = x25519.getPublicKey(teeSk);
    const teePkHex = bytesToHex(teePk);
    const teeSkHex = bytesToHex(teeSk);

    const listingId: Hex = `0x${'aa'.repeat(32)}`;
    const offerId: Hex = `0x${'bb'.repeat(32)}`;
    const aad = makeAad(listingId, offerId);

    const plaintext = new TextEncoder().encode('700000000000000000000000');
    const blob = seal({ teePubkey: teePkHex, plaintext, aad });

    const recovered = open({ privateKey: teeSkHex, blob, aad });
    expect(new TextDecoder().decode(recovered)).toBe('700000000000000000000000');
  });

  it('throws on ciphertext tampering', () => {
    const teeSk = randomBytes(32);
    const teePk = x25519.getPublicKey(teeSk);
    const teePkHex = bytesToHex(teePk);
    const teeSkHex = bytesToHex(teeSk);

    const aad = new Uint8Array(64);
    const plaintext = new TextEncoder().encode('700000000000000000000000');
    const blob = seal({ teePubkey: teePkHex, plaintext, aad });

    // Flip a byte in the ciphertext (after the 0x prefix)
    const ctHex = blob.ct;
    const tampered: Hex = `0x${ctHex.slice(2, 4)}ff${ctHex.slice(6)}`;
    const tamperedBlob = { ...blob, ct: tampered };

    expect(() => open({ privateKey: teeSkHex, blob: tamperedBlob, aad })).toThrow();
  });

  it('throws when aad does not match', () => {
    const teeSk = randomBytes(32);
    const teePk = x25519.getPublicKey(teeSk);
    const teePkHex = bytesToHex(teePk);
    const teeSkHex = bytesToHex(teeSk);

    const aad = makeAad(`0x${'aa'.repeat(32)}`, `0x${'bb'.repeat(32)}`);
    const wrongAad = makeAad(`0x${'cc'.repeat(32)}`, `0x${'dd'.repeat(32)}`);

    const plaintext = new TextEncoder().encode('700000000000000000000000');
    const blob = seal({ teePubkey: teePkHex, plaintext, aad });

    expect(() => open({ privateKey: teeSkHex, blob, aad: wrongAad })).toThrow();
  });
});

describe('envelope serialize / parse', () => {
  it('serialize then parse is identity', () => {
    const teeSk = randomBytes(32);
    const teePk = x25519.getPublicKey(teeSk);
    const teePkHex = bytesToHex(teePk);

    const aad = new Uint8Array(64);
    const plaintext = new TextEncoder().encode('hello');
    const blob = seal({ teePubkey: teePkHex, plaintext, aad });

    const bytes = serialize(blob);
    const parsed = parse(bytes);

    expect(parsed.v).toBe(1);
    expect(parsed.ephPub).toBe(blob.ephPub);
    expect(parsed.nonce).toBe(blob.nonce);
    expect(parsed.ct).toBe(blob.ct);
  });
});

describe('golden envelope fixture', () => {
  it('decrypts the fixed fixture (cross-language reference)', () => {
    // This fixture must also be decryptable by Python crypto.py.
    const { teeSk, listingId, offerId, plaintext, blob } = goldenFixture as {
      teeSk: Hex;
      listingId: Hex;
      offerId: Hex;
      plaintext: string;
      blob: { v: 1; ephPub: Hex; nonce: Hex; ct: Hex };
    };

    const aad = makeAad(listingId, offerId);
    const recovered = open({ privateKey: teeSk, blob, aad });
    expect(new TextDecoder().decode(recovered)).toBe(plaintext);
  });
});
