/**
 * Type-level test: plaintext DTOs compile correctly with @haggle/shared types.
 * These tests verify that the V2 API shapes are used consistently.
 */
import { describe, it, expect } from 'vitest';
import type {
  PostListingRequest,
  PostOfferRequest,
  GetStatusResponse,
  NearAiAttestation,
  RLNProof,
  Hex,
} from '@haggle/shared';

function hex(s: string): Hex {
  return `0x${s}` as Hex;
}

describe('V2 DTO type-level tests', () => {
  it('PostListingRequest has plaintextMinSell and plaintextSellerConditions', () => {
    const req: PostListingRequest = {
      listingId: hex('11'.repeat(32)),
      seller: hex('DEAD000000000000000000000000000000000000'),
      askPrice: '800000000000000000000000',
      requiredKarmaTier: 2,
      itemMeta: {
        title: '맥북 M1 Pro',
        description: '최상',
        category: 'electronics',
        images: [],
      },
      plaintextMinSell: '700000000000000000000000',
      plaintextSellerConditions: '강남/송파 직거래만, 평일 19시 이후',
      onchainTxHash: hex('aa'.repeat(32)),
    };

    expect(req.plaintextMinSell).toMatch(/^\d+$/);
    expect(req.plaintextSellerConditions).toBeTypeOf('string');
    // encMinSell must NOT exist on the V2 type
    // @ts-expect-error — encMinSell was removed in V2
    expect(req.encMinSell).toBeUndefined();
  });

  it('PostOfferRequest has plaintextMaxBuy and plaintextBuyerConditions', () => {
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
      bidPrice: '720000000000000000000000',
      plaintextMaxBuy: '750000000000000000000000',
      plaintextBuyerConditions: '강남 가능, 토요일만',
      rlnProof,
      onchainTxHash: hex('bb'.repeat(32)),
    };

    expect(req.plaintextMaxBuy).toMatch(/^\d+$/);
    expect(req.plaintextBuyerConditions).toBeTypeOf('string');
    // @ts-expect-error — encMaxBuy was removed in V2
    expect(req.encMaxBuy).toBeUndefined();
  });

  it('GetStatusResponse attestation is NearAiAttestation', () => {
    const attestation: NearAiAttestation = {
      dealId: hex('aa'.repeat(32)),
      listingId: hex('bb'.repeat(32)),
      offerId: hex('cc'.repeat(32)),
      agreedPrice: '725000000000000000000000',
      agreedConditions: {
        location: '강남역 8번출구',
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
