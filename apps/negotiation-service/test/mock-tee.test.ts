// Mock TEE end-to-end tests:
//   - encrypt a price, send to mock TEE, verify response + signature
// AAD convention: listingId (32 bytes) only. See PLAN §3.5 (updated).

import { describe, it, expect } from 'vitest';
import { keccak256, toBytes } from 'viem';
import { seal, buildListingAad } from '@haggle/crypto';
import { createMockTeeClient } from '../src/tee/mock.js';
import type { NegotiateRequest } from '../src/tee/client.js';
import type { TeeAttestation, TeeAgreement, TeeFailure } from '@haggle/shared';

// Demo-only keys (matches .env.example defaults)
// X25519 private key for mock TEE decryption
const MOCK_TEE_SK = '0x0000000000000000000000000000000000000000000000000000000000000001' as const;
// secp256k1 private key for mock TEE attestation signing
const MOCK_TEE_SIGNER_SK = '0x0000000000000000000000000000000000000000000000000000000000000002' as const;

const LISTING_ID = ('0x' + 'a1'.repeat(32)) as `0x${string}`;
const OFFER_ID = ('0x' + 'b2'.repeat(32)) as `0x${string}`;
const NONCE = ('0x' + 'c3'.repeat(16)) as `0x${string}`;

// All blobs use the same 32-byte AAD = listingId
function aad(): Uint8Array {
  return buildListingAad(LISTING_ID);
}

// Get mock TEE's X25519 pubkey from mock client
async function getMockPubkey(): Promise<`0x${string}`> {
  const client = createMockTeeClient(MOCK_TEE_SK, MOCK_TEE_SIGNER_SK);
  const { pubkey } = await client.getPubkey();
  return pubkey;
}

function encryptPrice(pubkey: `0x${string}`, priceWei: string): import('@haggle/shared').EncryptedBlob {
  return seal({
    teePubkey: pubkey,
    plaintext: new TextEncoder().encode(priceWei),
    aad: aad(),
  });
}

function encryptText(pubkey: `0x${string}`, text: string): import('@haggle/shared').EncryptedBlob {
  return seal({
    teePubkey: pubkey,
    plaintext: new TextEncoder().encode(text),
    aad: aad(),
  });
}

describe('mock TEE', () => {
  it('getPubkey → returns valid hex pubkey and signerAddress', async () => {
    const client = createMockTeeClient(MOCK_TEE_SK, MOCK_TEE_SIGNER_SK);
    const resp = await client.getPubkey();

    expect(resp.pubkey).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(resp.signerAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(resp.enclaveId).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it('agreement when maxBuy >= minSell → midpoint price, signed correctly', async () => {
    const client = createMockTeeClient(MOCK_TEE_SK, MOCK_TEE_SIGNER_SK);
    const pubkey = await getMockPubkey();

    const minSell = 700_000n;
    const maxBuy = 800_000n;
    const expectedMidpoint = ((minSell + maxBuy) / 2n).toString();

    const req: NegotiateRequest = {
      listingId: LISTING_ID,
      offerId: OFFER_ID,
      nonce: NONCE,
      listingMeta: { title: 'MacBook M1', category: 'electronics' },
      karmaTiers: { seller: 3, buyer: 1 },
      encMinSell: encryptPrice(pubkey, minSell.toString()),
      encSellerConditions: encryptText(pubkey, 'gangnam only'),
      encMaxBuy: encryptPrice(pubkey, maxBuy.toString()),
      encBuyerConditions: encryptText(pubkey, 'gangnam ok'),
    };

    const attestation = await client.negotiate(req);

    expect(attestation.result).toBe('agreement');
    const payload = attestation.payload as TeeAgreement;
    expect(payload.agreedPrice).toBe(expectedMidpoint);
    expect(payload.agreedConditions.location).toBe('강남역 8번출구');
    expect(payload.agreedConditions.payment).toBe('cash');

    // Verify signature: recover signer from EIP-191 sig over canonical JSON
    const { recoverMessageAddress } = await import('viem');
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    const recovered = await recoverMessageAddress({
      message: canonical,
      signature: attestation.signature,
    });
    expect(recovered.toLowerCase()).toBe(attestation.signerAddress.toLowerCase());
  });

  it('fail when maxBuy < minSell → no_price_zopa reason', async () => {
    const client = createMockTeeClient(MOCK_TEE_SK, MOCK_TEE_SIGNER_SK);
    const pubkey = await getMockPubkey();

    const minSell = 800_000n;
    const maxBuy = 700_000n; // maxBuy < minSell

    const req: NegotiateRequest = {
      listingId: LISTING_ID,
      offerId: OFFER_ID,
      nonce: NONCE,
      listingMeta: { title: 'MacBook M1', category: 'electronics' },
      karmaTiers: { seller: 3, buyer: 1 },
      encMinSell: encryptPrice(pubkey, minSell.toString()),
      encSellerConditions: encryptText(pubkey, 'gangnam only'),
      encMaxBuy: encryptPrice(pubkey, maxBuy.toString()),
      encBuyerConditions: encryptText(pubkey, 'gangnam ok'),
    };

    const attestation = await client.negotiate(req);

    expect(attestation.result).toBe('fail');
    const payload = attestation.payload as TeeFailure;
    const expectedHash = keccak256(toBytes('no_price_zopa'));
    expect(payload.reasonHash).toBe(expectedHash);

    // Verify the failure is still properly signed
    const { recoverMessageAddress } = await import('viem');
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    const recovered = await recoverMessageAddress({
      message: canonical,
      signature: attestation.signature,
    });
    expect(recovered.toLowerCase()).toBe(attestation.signerAddress.toLowerCase());
  });

  // PRD §2.12: seller "평일" + buyer "토요일만" → conditions_incompatible (even if ZOPA exists)
  it('fail when seller wants weekday but buyer wants weekend only → conditions_incompatible', async () => {
    const client = createMockTeeClient(MOCK_TEE_SK, MOCK_TEE_SIGNER_SK);
    const pubkey = await getMockPubkey();

    const minSell = 700_000n;
    const maxBuy = 750_000n; // ZOPA exists: maxBuy > minSell

    const req: NegotiateRequest = {
      listingId: LISTING_ID,
      offerId: OFFER_ID,
      nonce: NONCE,
      listingMeta: { title: 'MacBook M1', category: 'electronics' },
      karmaTiers: { seller: 3, buyer: 1 },
      encMinSell: encryptPrice(pubkey, minSell.toString()),
      encSellerConditions: encryptText(pubkey, '강남/송파 직거래만, 평일 19시 이후, 박스 없음'),
      encMaxBuy: encryptPrice(pubkey, maxBuy.toString()),
      encBuyerConditions: encryptText(pubkey, '강남 가능, 토요일만'),
    };

    const attestation = await client.negotiate(req);

    expect(attestation.result).toBe('fail');
    const payload = attestation.payload as TeeFailure;
    const expectedHash = keccak256(toBytes('conditions_incompatible'));
    expect(payload.reasonHash).toBe(expectedHash);
  });

  // PRD §2.12: seller "평일" + buyer "평일 가능, 강남 가능" → agreement at midpoint (725K)
  it('agreement when seller and buyer conditions are compatible → midpoint price', async () => {
    const client = createMockTeeClient(MOCK_TEE_SK, MOCK_TEE_SIGNER_SK);
    const pubkey = await getMockPubkey();

    const minSell = 700_000n;
    const maxBuy = 750_000n;
    const expectedMidpoint = ((minSell + maxBuy) / 2n).toString(); // "725000"

    const req: NegotiateRequest = {
      listingId: LISTING_ID,
      offerId: OFFER_ID,
      nonce: NONCE,
      listingMeta: { title: 'MacBook M1', category: 'electronics' },
      karmaTiers: { seller: 3, buyer: 1 },
      encMinSell: encryptPrice(pubkey, minSell.toString()),
      encSellerConditions: encryptText(pubkey, '강남/송파 직거래만, 평일 19시 이후, 박스 없음'),
      encMaxBuy: encryptPrice(pubkey, maxBuy.toString()),
      encBuyerConditions: encryptText(pubkey, '평일 가능, 강남 가능, 카드/현금 모두 OK'),
    };

    const attestation = await client.negotiate(req);

    expect(attestation.result).toBe('agreement');
    const payload = attestation.payload as TeeAgreement;
    expect(payload.agreedPrice).toBe(expectedMidpoint);
    expect(payload.agreedConditions.location).toBe('강남역 8번출구');
  });

  // Regression test for AAD mismatch blocker (qa-report.md BLOCKER #1).
  // Simulates the web UI flow: offer blobs sealed with real listingId AAD (32 bytes).
  // Before the fix, mock TEE used listingId||offerId (64 bytes) → decryption_failed.
  // After the fix, both sides use listingId (32 bytes) → agreement.
  it('regression: web-path offer blobs (listingId-only AAD) decrypt correctly → agreement', async () => {
    const client = createMockTeeClient(MOCK_TEE_SK, MOCK_TEE_SIGNER_SK);
    const pubkey = await getMockPubkey();

    const minSell = 700_000n;
    const maxBuy = 750_000n;

    // Simulate web UI: offer page seals with buildListingAad(real_listingId) = 32 bytes
    const offerAad = buildListingAad(LISTING_ID); // 32 bytes — matches new spec

    const encMaxBuy = seal({
      teePubkey: pubkey,
      plaintext: new TextEncoder().encode(maxBuy.toString()),
      aad: offerAad,
    });
    const encBuyerConditions = seal({
      teePubkey: pubkey,
      plaintext: new TextEncoder().encode('강남 가능, 평일 가능'),
      aad: offerAad,
    });

    // Listing blobs use listingId-only too (zeros32 for real web flow, but here use LISTING_ID)
    const req: NegotiateRequest = {
      listingId: LISTING_ID,
      offerId: OFFER_ID,
      nonce: NONCE,
      listingMeta: { title: 'MacBook M1', category: 'electronics' },
      karmaTiers: { seller: 3, buyer: 1 },
      encMinSell: encryptPrice(pubkey, minSell.toString()),
      encSellerConditions: encryptText(pubkey, '강남/송파, 평일만'),
      encMaxBuy,
      encBuyerConditions,
    };

    const attestation = await client.negotiate(req);

    // MUST be agreement, NOT fail with decryption_failed
    expect(attestation.result).toBe('agreement');
    const payload = attestation.payload as TeeAgreement;
    const expectedMidpoint = ((minSell + maxBuy) / 2n).toString();
    expect(payload.agreedPrice).toBe(expectedMidpoint);
  });

  it('health endpoint → ok: true', async () => {
    const client = createMockTeeClient(MOCK_TEE_SK, MOCK_TEE_SIGNER_SK);
    const result = await client.health();
    expect(result.ok).toBe(true);
  });
});
