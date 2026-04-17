// Routes integration tests — uses Fastify's .inject() (no real HTTP).
// runNegotiation (engine) and chain reads are stubbed via vi.mock.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerRoutes } from '../src/routes/index.js';
import type { KarmaTier } from '@haggle/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Mock engine ---
vi.mock('../src/negotiate/engine.js', () => ({
  runNegotiation: vi.fn().mockResolvedValue({
    kind: 'agreement',
    attestation: {
      dealId: '0x' + '00'.repeat(32),
      listingId: '0x' + '01'.repeat(32),
      offerId: '0x' + '02'.repeat(32),
      agreedPrice: '750000',
      agreedConditions: { location: 'gangnam', meetTimeIso: '2026-04-20T19:00:00+09:00', payment: 'cash' },
      agreedConditionsHash: '0x' + 'dd'.repeat(32),  // distinct from nearAiAttestationHash
      modelId: 'qwen3-30b',
      completionId: 'chatcmpl-test',
      nonce: '0x' + 'aa'.repeat(32),
      nearAiAttestationHash: '0x' + 'bb'.repeat(32),
      attestationBundleUrl: '/attestation/0x' + '00'.repeat(32),
      ts: 1_700_000_000,
    },
    bundle: {
      quote: '0x' + 'cc'.repeat(4),
      gpu_evidence: '0x' + 'dd'.repeat(4),
      signing_key: '0x' + 'ee'.repeat(4),
      signed_response: {
        model: 'qwen3-30b',
        nonce: '0x' + 'aa'.repeat(32),
        completion_id: 'chatcmpl-test',
        timestamp: 1_700_000_000,
      },
      signature: '0x' + 'ff'.repeat(4),
    },
    attestationBundlePath: '/tmp/test-attestations/0x0000.json',
  }),
}));

// --- Mock relayer ---
vi.mock('../src/chain/relayer.js', () => ({
  submitSettlement: vi.fn().mockResolvedValue('0x' + 'ab'.repeat(32)),
}));

// --- Mock attestation save ---
vi.mock('../src/nearai/attestation.js', () => ({
  saveAttestationBundle: vi.fn().mockReturnValue('/tmp/test.json'),
  loadAttestationBundle: vi.fn().mockReturnValue(null),
  fetchAttestation: vi.fn(),
  computeNonce: vi.fn(),
  hashBundle: vi.fn(),
  canonicalizeBundle: vi.fn(),
  runStartupAttestationCheck: vi.fn(),
}));

// --- Mock on-chain ID verification ---
vi.mock('../src/chain/verifyIds.js', () => ({
  verifyListingOnChain: vi.fn().mockResolvedValue({ seller: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' }),
  verifyOfferOnChain: vi.fn().mockResolvedValue({ buyer: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' }),
}));

// --- Helpers ---

function buildDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = readFileSync(join(__dirname, '../src/db/schema.sql'), 'utf-8');
  db.exec(schema);
  return db;
}

function makeChainDeps(overrides?: {
  canOffer?: boolean;
  tier?: KarmaTier;
  activeNegotiations?: number;
}) {
  const co = overrides?.canOffer ?? true;
  const tier = overrides?.tier ?? (0 as KarmaTier);
  const active = overrides?.activeNegotiations ?? 0;

  return {
    client: {
      readContract: vi.fn().mockImplementation(({ functionName }: { functionName: string }) => {
        if (functionName === 'canOffer') return Promise.resolve(co);
        if (functionName === 'getTier') return Promise.resolve(tier);
        if (functionName === 'activeNegotiations') return Promise.resolve(BigInt(active));
        return Promise.resolve(null);
      }),
    } as unknown as import('../src/chain/read.js').createChainClient extends (...args: infer _) => infer R ? R : never,
    karmaReaderAddress: '0x0000000000000000000000000000000000000001' as const,
    haggleEscrowAddress: '0x0000000000000000000000000000000000000002' as const,
    rpcUrl: 'http://localhost:8545',
  };
}

const SELLER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;
const BUYER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;
const RELAYER_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;

async function buildApp(
  db: Database.Database,
  chainOverrides?: Parameters<typeof makeChainDeps>[0],
) {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  await registerRoutes(app, {
    db,
    chain: makeChainDeps(chainOverrides) as Parameters<typeof registerRoutes>[1]['chain'],
    nearAi: {
      apiKey: 'test-key',
      baseURL: 'https://cloud-api.near.ai/v1',
      model: 'qwen3-30b',
      timeoutMs: 8000,
    },
    relayerPrivateKey: RELAYER_PK,
    haggleEscrowAddress: '0x0000000000000000000000000000000000000002',
    attestationDir: '/tmp/test-attestations',
  });
  return app;
}

const LISTING_ID = ('0x' + 'a1'.repeat(32)) as const;
const OFFER_ID = ('0x' + 'b2'.repeat(32)) as const;
const ONCHAIN_TX_HASH = ('0x' + 'c3'.repeat(32)) as const;

function makeValidListing(overrides?: { listingId?: string }) {
  return {
    listingId: overrides?.listingId ?? LISTING_ID,
    seller: SELLER,
    askPrice: '1000000',
    requiredKarmaTier: 0,
    itemMeta: { title: 'MacBook M1', description: 'Good condition', category: 'electronics', images: [] },
    plaintextMinSell: '800000',
    plaintextSellerConditions: '강남, 주말 오후',
    onchainTxHash: ONCHAIN_TX_HASH,
  };
}

function makeValidOffer(listingId: string, nullifier?: string, offerId?: string) {
  return {
    offerId: offerId ?? OFFER_ID,
    buyer: BUYER,
    listingId,
    bidPrice: '900000',
    plaintextMaxBuy: '950000',
    plaintextBuyerConditions: 'gangnam, weekends',
    rlnProof: {
      epoch: 1,
      proof: '0x' + 'aa'.repeat(32),
      nullifier: nullifier ?? ('0x' + '11'.repeat(32)),
      signalHash: '0x' + '22'.repeat(32),
      rlnIdentityCommitment: '0x' + '33'.repeat(32),
    },
    onchainTxHash: ONCHAIN_TX_HASH,
  };
}

// --- Test: POST /listing ---

describe('POST /listing', () => {
  let db: Database.Database;

  beforeEach(() => { db = buildDb(); });
  afterEach(() => { db.close(); });

  it('happy path → 201 with listingId, row in DB', async () => {
    const app = await buildApp(db);

    const res = await app.inject({
      method: 'POST',
      url: '/listing',
      payload: makeValidListing(),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ listingId: string; onchainTxHash: string }>();
    expect(body.listingId).toBe(LISTING_ID);
    expect(body.onchainTxHash).toBe(ONCHAIN_TX_HASH);

    // Verify DB row exists
    const row = db.prepare('SELECT * FROM listings WHERE id = ?').get(
      Buffer.from(body.listingId.slice(2), 'hex'),
    );
    expect(row).toBeTruthy();
  });

  it('missing plaintextMinSell → 400', async () => {
    const app = await buildApp(db);
    const payload = { ...makeValidListing(), plaintextMinSell: undefined };

    const res = await app.inject({
      method: 'POST',
      url: '/listing',
      payload,
    });

    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('bad-request');
  });

  it('non-decimal plaintextMinSell → 400', async () => {
    const app = await buildApp(db);

    const res = await app.inject({
      method: 'POST',
      url: '/listing',
      payload: { ...makeValidListing(), plaintextMinSell: 'not-a-number' },
    });

    expect(res.statusCode).toBe(400);
  });
});

// --- Test: POST /offer ---

describe('POST /offer', () => {
  let db: Database.Database;
  // listingId is always LISTING_ID (the on-chain id passed in makeValidListing)
  const listingId = LISTING_ID;

  beforeEach(async () => {
    db = buildDb();
    const app = await buildApp(db);
    await app.inject({
      method: 'POST',
      url: '/listing',
      payload: makeValidListing(),
    });
  });

  afterEach(() => { db.close(); });

  it('happy path → 202, negotiation queued', async () => {
    const app = await buildApp(db);

    const res = await app.inject({
      method: 'POST',
      url: '/offer',
      payload: makeValidOffer(listingId),
    });

    expect(res.statusCode).toBe(202);
    const body = res.json<{ offerId: string; negotiationId: string; status: string }>();
    expect(body.status).toBe('queued');
    expect(body.negotiationId).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it('duplicate nullifier → 403 rln-rejected', async () => {
    const app = await buildApp(db);
    const nullifier = '0x' + 'ff'.repeat(32);

    await app.inject({ method: 'POST', url: '/offer', payload: makeValidOffer(listingId, nullifier) });
    db.exec(`UPDATE rln_nullifiers SET count = 3 WHERE epoch = 1`);

    const res = await app.inject({
      method: 'POST',
      url: '/offer',
      payload: makeValidOffer(listingId, nullifier),
    });

    expect(res.statusCode).toBe(403);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('rln-rejected');
  });

  it('karma-gate fail → 403 karma-gate', async () => {
    const app = await buildApp(db, { canOffer: false });

    const res = await app.inject({
      method: 'POST',
      url: '/offer',
      payload: makeValidOffer(listingId),
    });

    expect(res.statusCode).toBe(403);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('karma-gate');
  });

  it('throughput exceeded → 409', async () => {
    const app = await buildApp(db, { tier: 0, activeNegotiations: 3 });

    const res = await app.inject({
      method: 'POST',
      url: '/offer',
      payload: makeValidOffer(listingId),
    });

    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('throughput-exceeded');
  });

  it('missing plaintextMaxBuy → 400', async () => {
    const app = await buildApp(db);
    const payload = { ...makeValidOffer(listingId), plaintextMaxBuy: undefined };

    const res = await app.inject({
      method: 'POST',
      url: '/offer',
      payload,
    });

    expect(res.statusCode).toBe(400);
  });
});

// --- Test: GET /status ---

describe('GET /status/:negotiationId', () => {
  let db: Database.Database;

  beforeEach(() => { db = buildDb(); });
  afterEach(() => { db.close(); });

  it('unknown negotiationId → 404', async () => {
    const app = await buildApp(db);
    const fakeId = '0x' + 'ab'.repeat(32);

    const res = await app.inject({
      method: 'GET',
      url: `/status/${fakeId}`,
    });

    expect(res.statusCode).toBe(404);
  });

  it('invalid negotiationId → 400', async () => {
    const app = await buildApp(db);

    const res = await app.inject({
      method: 'GET',
      url: '/status/not-a-hex',
    });

    expect(res.statusCode).toBe(400);
  });
});

// --- Test: GET /attestation/:dealId ---

describe('GET /attestation/:dealId', () => {
  let db: Database.Database;

  beforeEach(() => { db = buildDb(); });
  afterEach(() => { db.close(); });

  it('no bundle on disk → 404', async () => {
    const app = await buildApp(db);
    const fakeId = '0x' + 'cd'.repeat(32);

    const res = await app.inject({
      method: 'GET',
      url: `/attestation/${fakeId}`,
    });

    expect(res.statusCode).toBe(404);
  });
});
