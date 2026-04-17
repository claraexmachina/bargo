/**
 * Roundtrip test: seal() → open() must recover plaintext.
 * Uses @haggle/crypto test-only open().
 * Noble deps are transitive through @haggle/crypto — import via dynamic require.
 */
import { describe, it, expect } from 'vitest';
import { seal, open } from '@haggle/crypto';
import type { Hex } from '@haggle/shared';

function bytesToHex(b: Uint8Array): Hex {
  return `0x${Array.from(b)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')}` as Hex;
}

async function generateTestKeypair(): Promise<{ skHex: Hex; pubHex: Hex }> {
  const { x25519 } = await import('@noble/curves/ed25519');
  const { randomBytes } = await import('@noble/ciphers/webcrypto');
  const sk = randomBytes(32);
  const pub = x25519.getPublicKey(sk);
  return { skHex: bytesToHex(sk), pubHex: bytesToHex(pub) };
}

const ZERO_AAD = new Uint8Array(64);

describe('seal / open roundtrip', () => {
  it('recovers reservation price plaintext', async () => {
    const { skHex, pubHex } = await generateTestKeypair();

    const priceWei = '700000000000000000000000';
    const plaintext = new TextEncoder().encode(priceWei);
    const blob = seal({ teePubkey: pubHex, plaintext, aad: ZERO_AAD });

    const recovered = open({ privateKey: skHex, blob, aad: ZERO_AAD });
    expect(new TextDecoder().decode(recovered)).toBe(priceWei);
  });

  it('recovers conditions plaintext', async () => {
    const { skHex, pubHex } = await generateTestKeypair();

    const conditions = '강남/송파 직거래만, 평일 19시 이후, 박스 없음';
    const plaintext = new TextEncoder().encode(conditions);
    const blob = seal({ teePubkey: pubHex, plaintext, aad: ZERO_AAD });

    const recovered = open({ privateKey: skHex, blob, aad: ZERO_AAD });
    expect(new TextDecoder().decode(recovered)).toBe(conditions);
  });

  it('fails with wrong AAD', async () => {
    const { skHex, pubHex } = await generateTestKeypair();

    const plaintext = new TextEncoder().encode('test');
    const aad1 = new Uint8Array(64).fill(1);
    const aad2 = new Uint8Array(64).fill(2);
    const blob = seal({ teePubkey: pubHex, plaintext, aad: aad1 });

    expect(() => open({ privateKey: skHex, blob, aad: aad2 })).toThrow();
  });
});
