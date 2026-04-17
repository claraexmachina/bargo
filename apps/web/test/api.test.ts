import type {
  EncryptedBlob,
  GetStatusResponse,
  Hex,
  NearAiAttestation,
  PostListingRequest,
  PostOfferRequest,
  RLNProof,
} from '@bargo/shared';
/**
 * Type-level tests: V3 sealed-bid DTOs. No public price fields anywhere.
 * Reservation data always passes as EncryptedBlob.
 */
import { describe, expect, it } from 'vitest';

function hex(s: string): Hex {
  return `0x${s}` as Hex;
}

function fakeBlob(): EncryptedBlob {
  return {
    v: 1,
    ephPub: hex('aa'.repeat(32)),
    nonce: hex('bb'.repeat(24)),
    ct: hex('cc'.repeat(48)),
  };
}

describe('V3 DTO type-level tests', () => {
  it('PostListingRequest has encMinSell + encSellerConditions (no askPrice, no plaintext)', () => {
    const req: PostListingRequest = {
      listingId: hex('11'.repeat(32)),
      seller: hex('DEAD000000000000000000000000000000000000'),
      requiredKarmaTier: 2,
      itemMeta: {
        title: 'MacBook M1 Pro',
        description: 'Excellent condition',
        category: 'electronics',
        images: [],
      },
      encMinSell: fakeBlob(),
      encSellerConditions: fakeBlob(),
      onchainTxHash: hex('aa'.repeat(32)),
    };

    expect(req.encMinSell.v).toBe(1);
    expect(req.encSellerConditions.v).toBe(1);
  });

  it('PostOfferRequest has encMaxBuy + encBuyerConditions (no bidPrice, no plaintext)', () => {
    const rlnProof: RLNProof = {
      epoch: 1,
      proof: hex('aa'.repeat(32)),
      nullifier: hex('bb'.repeat(32)),
      signalHash: hex('cc'.repeat(32)),
      rlnIdentityCommitment: hex('dd'.repeat(32)),
    };

    const req: PostOfferRequest = {
      offerId: hex('22'.repeat(32)),
      buyer: hex('BEEF000000000000000000000000000000000000'),
      listingId: hex('11'.repeat(32)),
      encMaxBuy: fakeBlob(),
      encBuyerConditions: fakeBlob(),
      rlnProof,
      onchainTxHash: hex('bb'.repeat(32)),
    };

    expect(req.encMaxBuy.v).toBe(1);
    expect(req.encBuyerConditions.v).toBe(1);
  });

  it('GetStatusResponse attestation is NearAiAttestation — agreedPrice is the only revealed price', () => {
    const attestation: NearAiAttestation = {
      dealId: hex('aa'.repeat(32)),
      listingId: hex('bb'.repeat(32)),
      offerId: hex('cc'.repeat(32)),
      agreedPrice: '725000000000000000000000',
      agreedConditions: {
        location: 'Gangnam Station Exit 8',
        meetTimeIso: '2026-04-18T19:00:00+09:00',
        payment: 'cash',
      },
      agreedConditionsHash: hex('ff'.repeat(32)),
      modelId: 'qwen3-30b',
      completionId: 'chatcmpl-xyz',
      nonce: hex('dd'.repeat(32)),
      nearAiAttestationHash: hex('ee'.repeat(32)),
      attestationBundleUrl: '/attestation/0xdeadbeef',
      ts: 1700000000,
    };

    const status: GetStatusResponse = {
      negotiationId: hex('aa'.repeat(32)),
      state: 'agreement',
      attestation,
      updatedAt: 1700000000,
    };

    expect(status.attestation?.modelId).toBe('qwen3-30b');
    expect(status.attestation?.nearAiAttestationHash).toMatch(/^0x/);
  });
});
