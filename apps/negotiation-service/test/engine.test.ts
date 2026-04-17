// Engine unit tests — mocks parseConditionsPair, fetchAttestation, and decryptReservationEphemeral.

import type { ConditionStruct, EncryptedBlob } from '@bargo/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks ---

vi.mock('../src/nearai/client.js', () => ({
  parseConditionsPair: vi.fn(),
  LLMTimeoutError: class LLMTimeoutError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'LLMTimeoutError';
    }
  },
}));

vi.mock('../src/nearai/attestation.js', () => ({
  fetchAttestation: vi.fn(),
  saveAttestationBundle: vi.fn().mockReturnValue('/tmp/test.json'),
  computeNonce: vi.fn().mockReturnValue(`0x${'aa'.repeat(32)}`),
  hashBundle: vi.fn().mockReturnValue(`0x${'bb'.repeat(32)}`),
  canonicalizeBundle: vi.fn().mockReturnValue('{}'),
  loadAttestationBundle: vi.fn().mockReturnValue(null),
  runStartupAttestationCheck: vi.fn(),
}));

// Mock ephemeral decrypt so engine tests don't need real crypto
vi.mock('../src/crypto/decryptEphemeral.js', () => ({
  decryptReservationEphemeral: vi.fn().mockReturnValue({
    minSellWei: 800000n,
    maxBuyWei: 950000n,
    sellerConditions: '강남, 주말',
    buyerConditions: 'gangnam, weekends',
  }),
}));

import * as nearAiAttestationMock from '../src/nearai/attestation.js';
import { LLMTimeoutError } from '../src/nearai/client.js';
import * as nearAiClientMock from '../src/nearai/client.js';
import * as decryptMock from '../src/crypto/decryptEphemeral.js';
import { runNegotiation } from '../src/negotiate/engine.js';

// Typed mock helpers
const mockParseConditionsPair = nearAiClientMock.parseConditionsPair as ReturnType<typeof vi.fn>;
const mockFetchAttestation = nearAiAttestationMock.fetchAttestation as ReturnType<typeof vi.fn>;
const mockSaveAttestationBundle = nearAiAttestationMock.saveAttestationBundle as ReturnType<
  typeof vi.fn
>;
const mockDecryptReservationEphemeral =
  decryptMock.decryptReservationEphemeral as ReturnType<typeof vi.fn>;

// Minimal EncryptedBlob fixture
function makeBlob(tag: string): EncryptedBlob {
  return {
    v: 1,
    ephPub: `0x${'a0'.repeat(32)}` as `0x${string}`,
    nonce: `0x${'b0'.repeat(24)}` as `0x${string}`,
    ct: `0x${tag.repeat(4)}` as `0x${string}`,
  };
}

const BASE_OPTS = {
  dealId: `0x${'00'.repeat(32)}` as `0x${string}`,
  listingId: `0x${'01'.repeat(32)}` as `0x${string}`,
  offerId: `0x${'02'.repeat(32)}` as `0x${string}`,
  listingTitle: 'Test Item',
  encMinSell: makeBlob('11'),
  encSellerConditions: makeBlob('22'),
  encMaxBuy: makeBlob('33'),
  encBuyerConditions: makeBlob('44'),
  serviceDecryptSk: `0x${'42'.repeat(32)}` as `0x${string}`,
  sellerKarmaTier: 1 as const,
  buyerKarmaTier: 1 as const,
  nearAiApiKey: 'test-key',
  nearAiBaseURL: 'https://cloud-api.near.ai/v1',
  nearAiModel: 'qwen3-30b',
  nearAiTimeoutMs: 8000,
  attestationDir: '/tmp/test-attestations',
};

const SELLER_CONDITIONS: ConditionStruct = {
  location: ['gangnam'],
  timeWindow: { days: ['sat', 'sun'], startHour: 14, endHour: 20 },
  payment: ['cash', 'transfer'],
  extras: [],
};

const BUYER_CONDITIONS: ConditionStruct = {
  location: ['gangnam', 'songpa'],
  timeWindow: { days: ['sat', 'sun'], startHour: 10, endHour: 18 },
  payment: ['cash'],
  extras: [],
};

const MOCK_BUNDLE = {
  quote: `0x${'cc'.repeat(4)}`,
  gpu_evidence: `0x${'dd'.repeat(4)}`,
  signing_key: `0x${'ee'.repeat(4)}`,
  signed_response: {
    model: 'qwen3-30b',
    nonce: `0x${'aa'.repeat(32)}`,
    completion_id: 'chatcmpl-test',
    timestamp: 1_700_000_000,
  },
  signature: `0x${'ff'.repeat(4)}`,
};

function mockHappyPath() {
  mockParseConditionsPair.mockResolvedValue({
    seller: SELLER_CONDITIONS,
    buyer: BUYER_CONDITIONS,
    completionId: 'chatcmpl-test',
  });
  mockFetchAttestation.mockResolvedValue({
    bundle: MOCK_BUNDLE,
    bundleHash: `0x${'bb'.repeat(32)}`,
    nonce: `0x${'aa'.repeat(32)}`,
  });
}

describe('runNegotiation — happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHappyPath();
    // Restore default decrypt mock after clearAllMocks
    mockDecryptReservationEphemeral.mockReturnValue({
      minSellWei: 800000n,
      maxBuyWei: 950000n,
      sellerConditions: '강남, 주말',
      buyerConditions: 'gangnam, weekends',
    });
  });

  it('returns agreement with attestation', async () => {
    const result = await runNegotiation(BASE_OPTS);

    expect(result.kind).toBe('agreement');
    if (result.kind !== 'agreement') return;

    expect(result.attestation.dealId).toBe(BASE_OPTS.dealId);
    expect(result.attestation.modelId).toBe('qwen3-30b');
    expect(result.attestation.completionId).toBe('chatcmpl-test');
    expect(result.attestation.agreedConditions.location).toBe('gangnam');
    expect(result.attestation.agreedConditions.payment).toBe('cash');
    // agreedConditionsHash must be a distinct hex (not same as nearAiAttestationHash)
    expect(result.attestation.agreedConditionsHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(result.attestation.agreedConditionsHash).not.toBe(
      result.attestation.nearAiAttestationHash,
    );
    expect(result.attestationBundlePath).toBe('/tmp/test.json');
    // agreedPrice within ZOPA: 800000..950000
    const price = BigInt(result.attestation.agreedPrice);
    expect(price).toBeGreaterThanOrEqual(800000n);
    expect(price).toBeLessThanOrEqual(950000n);
  });

  it('saveAttestationBundle is called with correct args', async () => {
    await runNegotiation(BASE_OPTS);
    expect(mockSaveAttestationBundle).toHaveBeenCalledWith(
      BASE_OPTS.attestationDir,
      BASE_OPTS.dealId,
      MOCK_BUNDLE,
    );
  });

  it('decryptReservationEphemeral is called with enc blobs and listingId', async () => {
    await runNegotiation(BASE_OPTS);
    expect(mockDecryptReservationEphemeral).toHaveBeenCalledWith({
      serviceDecryptSk: BASE_OPTS.serviceDecryptSk,
      listingId: BASE_OPTS.listingId,
      encMinSell: BASE_OPTS.encMinSell,
      encSellerConditions: BASE_OPTS.encSellerConditions,
      encMaxBuy: BASE_OPTS.encMaxBuy,
      encBuyerConditions: BASE_OPTS.encBuyerConditions,
    });
  });
});

describe('runNegotiation — no_price_zopa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns fail when buyerMax < sellerMin', async () => {
    mockDecryptReservationEphemeral.mockReturnValue({
      minSellWei: 1000000n,
      maxBuyWei: 500000n,
      sellerConditions: '강남',
      buyerConditions: 'gangnam',
    });

    const result = await runNegotiation(BASE_OPTS);

    expect(result.kind).toBe('fail');
    if (result.kind !== 'fail') return;
    expect(result.reason).toBe('no_price_zopa');
    expect(mockParseConditionsPair).not.toHaveBeenCalled();
  });
});

describe('runNegotiation — conditions_incompatible', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDecryptReservationEphemeral.mockReturnValue({
      minSellWei: 800000n,
      maxBuyWei: 950000n,
      sellerConditions: '홍대',
      buyerConditions: 'gangnam',
    });
    mockParseConditionsPair.mockResolvedValue({
      seller: {
        ...SELLER_CONDITIONS,
        location: ['hongdae'],
      } as ConditionStruct,
      buyer: {
        ...BUYER_CONDITIONS,
        location: ['gangnam'],
      } as ConditionStruct,
      completionId: 'chatcmpl-test',
    });
  });

  it('returns fail when locations incompatible', async () => {
    const result = await runNegotiation(BASE_OPTS);

    expect(result.kind).toBe('fail');
    if (result.kind !== 'fail') return;
    expect(result.reason).toBe('conditions_incompatible');
  });
});

describe('runNegotiation — llm_timeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDecryptReservationEphemeral.mockReturnValue({
      minSellWei: 800000n,
      maxBuyWei: 950000n,
      sellerConditions: '강남',
      buyerConditions: 'gangnam',
    });
    mockParseConditionsPair.mockRejectedValue(new LLMTimeoutError('timed out'));
  });

  it('returns fail with llm_timeout', async () => {
    const result = await runNegotiation(BASE_OPTS);

    expect(result.kind).toBe('fail');
    if (result.kind !== 'fail') return;
    expect(result.reason).toBe('llm_timeout');
  });
});
