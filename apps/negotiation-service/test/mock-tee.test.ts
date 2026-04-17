// Mock TEE end-to-end tests:
//   - encrypt a price, send to mock TEE, verify response + signature

import { describe, it, expect } from 'vitest';
import { keccak256, toBytes, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { seal } from '@haggle/crypto';
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

function buildAadListingOnly(): Uint8Array {
  const aad = new Uint8Array(64);
  const listingBytes = Buffer.from(LISTING_ID.slice(2), 'hex');
  aad.set(listingBytes, 0);
  return aad;
}

function buildAad(): Uint8Array {
  const aad = new Uint8Array(64);
  aad.set(Buffer.from(LISTING_ID.slice(2), 'hex'), 0);
  aad.set(Buffer.from(OFFER_ID.slice(2), 'hex'), 32);
  return aad;
}

// Get mock TEE's X25519 pubkey from mock client
async function getMockPubkey(): Promise<`0x${string}`> {
  const client = createMockTeeClient(MOCK_TEE_SK, MOCK_TEE_SIGNER_SK);
  const { pubkey } = await client.getPubkey();
  return pubkey;
}

function encryptPrice(pubkey: `0x${string}`, priceWei: string, aad: Uint8Array): import('@haggle/shared').EncryptedBlob {
  return seal({
    teePubkey: pubkey,
    plaintext: new TextEncoder().encode(priceWei),
    aad,
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

    const encMinSell = encryptPrice(pubkey, minSell.toString(), buildAadListingOnly());
    const encMaxBuy = encryptPrice(pubkey, maxBuy.toString(), buildAad());

    const req: NegotiateRequest = {
      listingId: LISTING_ID,
      offerId: OFFER_ID,
      nonce: NONCE,
      listingMeta: { title: 'MacBook M1', category: 'electronics' },
      karmaTiers: { seller: 3, buyer: 1 },
      encMinSell,
      encSellerConditions: encryptPrice(pubkey, 'gangnam only', buildAadListingOnly()),
      encMaxBuy,
      encBuyerConditions: encryptPrice(pubkey, 'gangnam ok', buildAad()),
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

    const encMinSell = encryptPrice(pubkey, minSell.toString(), buildAadListingOnly());
    const encMaxBuy = encryptPrice(pubkey, maxBuy.toString(), buildAad());

    const req: NegotiateRequest = {
      listingId: LISTING_ID,
      offerId: OFFER_ID,
      nonce: NONCE,
      listingMeta: { title: 'MacBook M1', category: 'electronics' },
      karmaTiers: { seller: 3, buyer: 1 },
      encMinSell,
      encSellerConditions: encryptPrice(pubkey, 'gangnam only', buildAadListingOnly()),
      encMaxBuy,
      encBuyerConditions: encryptPrice(pubkey, 'gangnam ok', buildAad()),
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

    const sellerConditions = '강남/송파 직거래만, 평일 19시 이후, 박스 없음';
    const buyerConditions = '강남 가능, 토요일만';

    const encMinSell = encryptPrice(pubkey, minSell.toString(), buildAadListingOnly());
    const encMaxBuy = encryptPrice(pubkey, maxBuy.toString(), buildAad());
    const encSellerConditions = seal({
      teePubkey: pubkey,
      plaintext: new TextEncoder().encode(sellerConditions),
      aad: buildAadListingOnly(),
    });
    const encBuyerConditions = seal({
      teePubkey: pubkey,
      plaintext: new TextEncoder().encode(buyerConditions),
      aad: buildAad(),
    });

    const req: NegotiateRequest = {
      listingId: LISTING_ID,
      offerId: OFFER_ID,
      nonce: NONCE,
      listingMeta: { title: 'MacBook M1', category: 'electronics' },
      karmaTiers: { seller: 3, buyer: 1 },
      encMinSell,
      encSellerConditions,
      encMaxBuy,
      encBuyerConditions,
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

    const sellerConditions = '강남/송파 직거래만, 평일 19시 이후, 박스 없음';
    const buyerConditions = '평일 가능, 강남 가능, 카드/현금 모두 OK';

    const encMinSell = encryptPrice(pubkey, minSell.toString(), buildAadListingOnly());
    const encMaxBuy = encryptPrice(pubkey, maxBuy.toString(), buildAad());
    const encSellerConditions = seal({
      teePubkey: pubkey,
      plaintext: new TextEncoder().encode(sellerConditions),
      aad: buildAadListingOnly(),
    });
    const encBuyerConditions = seal({
      teePubkey: pubkey,
      plaintext: new TextEncoder().encode(buyerConditions),
      aad: buildAad(),
    });

    const req: NegotiateRequest = {
      listingId: LISTING_ID,
      offerId: OFFER_ID,
      nonce: NONCE,
      listingMeta: { title: 'MacBook M1', category: 'electronics' },
      karmaTiers: { seller: 3, buyer: 1 },
      encMinSell,
      encSellerConditions,
      encMaxBuy,
      encBuyerConditions,
    };

    const attestation = await client.negotiate(req);

    expect(attestation.result).toBe('agreement');
    const payload = attestation.payload as TeeAgreement;
    expect(payload.agreedPrice).toBe(expectedMidpoint);
    expect(payload.agreedConditions.location).toBe('강남역 8번출구');
  });

  it('health endpoint → ok: true', async () => {
    const client = createMockTeeClient(MOCK_TEE_SK, MOCK_TEE_SIGNER_SK);
    const result = await client.health();
    expect(result.ok).toBe(true);
  });
});
