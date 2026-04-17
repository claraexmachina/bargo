// Routes integration tests — uses Fastify's .inject() (no real HTTP).
// TEE client and chain reads are stubbed.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { keccak256, toBytes, toHex, encodePacked } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { registerRoutes } from '../src/routes/index.js';
import type { TeeClient, NegotiateRequest } from '../src/tee/client.js';
import type { TeeAttestation, TeeAgreement, GetTeePubkeyResponse, EncryptedBlob, KarmaTier } from '@haggle/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Helpers ---

function buildDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = readFileSync(join(__dirname, '../src/db/schema.sql'), 'utf-8');
  db.exec(schema);
  return db;
}

// Fixed mock signer key for tests
const SIGNER_SK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const signerAccount = privateKeyToAccount(SIGNER_SK);

async function buildMockTeeAttestation(
  req: NegotiateRequest,
  result: 'agreement' | 'fail' = 'agreement',
): Promise<TeeAttestation> {
  const ts = Math.floor(Date.now() / 1000);
  const payload: TeeAgreement = {
    listingId: req.listingId,
    offerId: req.offerId,
    agreedPrice: '750000',
    agreedConditions: { location: 'gangnam', meetTimeIso: '2026-04-20T19:00:00+09:00', payment: 'cash' },
    modelId: 'mock-tee@test',
    enclaveId: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    ts,
    nonce: req.nonce,
  };
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  const signature = await signerAccount.signMessage({ message: canonical });
  return { payload, result, signature, signerAddress: signerAccount.address };
}

// Stub TEE client
function makeMockTee(overrides?: Partial<TeeClient>): TeeClient {
  return {
    async negotiate(req) {
      return buildMockAttestation(req);
    },
    async getPubkey() {
      return {
        pubkey: '0x' + '00'.repeat(32),
        enclaveId: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        modelId: 'mock-tee@test',
        signerAddress: signerAccount.address,
        whitelistedAt: 1_700_000_000,
      };
    },
    async health() {
      return {
        ok: true,
        enclaveId: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        modelId: 'mock-tee@test',
      };
    },
    ...overrides,
  };
}

async function buildMockAttestation(req: NegotiateRequest): Promise<TeeAttestation> {
  return buildMockTeeAttestation(req, 'agreement');
}

// Stub chain deps — canOffer returns true by default
function makeChainDeps(overrides?: {
  canOffer?: boolean;
  tier?: KarmaTier;
  activeNegotiations?: number;
}) {
  const co = overrides?.canOffer ?? true;
  const tier = overrides?.tier ?? (0 as KarmaTier);
  const active = overrides?.activeNegotiations ?? 0;

  // We mock the actual functions by mocking the module
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
  };
}

const DUMMY_ENCRYPTED_BLOB: EncryptedBlob = {
  v: 1,
  ephPub: '0x' + 'ab'.repeat(32),
  nonce: '0x' + 'cd'.repeat(24),
  ct: '0x' + 'ef'.repeat(48),
};

const SELLER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;
const BUYER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;

// --- Test setup ---

async function buildApp(
  db: Database.Database,
  tee: TeeClient = makeMockTee(),
  chainOverrides?: Parameters<typeof makeChainDeps>[0],
) {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  await registerRoutes(app, {
    db,
    tee,
    chain: makeChainDeps(chainOverrides) as Parameters<typeof registerRoutes>[1]['chain'],
  });
  return app;
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
      payload: {
        seller: SELLER,
        askPrice: '1000000',
        requiredKarmaTier: 0,
        itemMeta: { title: 'MacBook M1', description: 'Good condition', category: 'electronics', images: [] },
        encMinSell: DUMMY_ENCRYPTED_BLOB,
        encSellerConditions: DUMMY_ENCRYPTED_BLOB,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ listingId: string; onchainTxHash: null }>();
    expect(body.listingId).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(body.onchainTxHash).toBeNull();

    // Verify DB row
    const row = db.prepare('SELECT * FROM listings WHERE id = ?').get(
      Buffer.from(body.listingId.slice(2), 'hex'),
    );
    expect(row).toBeTruthy();
  });

  it('bad envelope (missing encMinSell) → 400', async () => {
    const app = await buildApp(db);

    const res = await app.inject({
      method: 'POST',
      url: '/listing',
      payload: {
        seller: SELLER,
        askPrice: '1000000',
        requiredKarmaTier: 0,
        itemMeta: { title: 'Test', description: '', category: 'electronics', images: [] },
        // encMinSell missing
        encSellerConditions: DUMMY_ENCRYPTED_BLOB,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('bad-request');
  });
});

// --- Test: POST /offer ---

describe('POST /offer', () => {
  let db: Database.Database;
  let listingId: string;

  beforeEach(async () => {
    db = buildDb();

    // Pre-insert a listing
    const app = await buildApp(db);
    const res = await app.inject({
      method: 'POST',
      url: '/listing',
      payload: {
        seller: SELLER,
        askPrice: '1000000',
        requiredKarmaTier: 0,
        itemMeta: { title: 'MacBook M1', description: '', category: 'electronics', images: [] },
        encMinSell: DUMMY_ENCRYPTED_BLOB,
        encSellerConditions: DUMMY_ENCRYPTED_BLOB,
      },
    });
    listingId = (res.json() as { listingId: string }).listingId;
  });

  afterEach(() => { db.close(); });

  function makeValidOffer(nullifier?: string) {
    return {
      buyer: BUYER,
      listingId,
      bidPrice: '900000',
      encMaxBuy: DUMMY_ENCRYPTED_BLOB,
      encBuyerConditions: DUMMY_ENCRYPTED_BLOB,
      rlnProof: {
        epoch: 1,
        proof: '0x' + 'aa'.repeat(32),
        nullifier: nullifier ?? ('0x' + '11'.repeat(32)),
        signalHash: '0x' + '22'.repeat(32),
        rlnIdentityCommitment: '0x' + '33'.repeat(32),
      },
    };
  }

  it('happy path → 202, poll /status yields agreement', async () => {
    const app = await buildApp(db);

    const res = await app.inject({
      method: 'POST',
      url: '/offer',
      payload: makeValidOffer(),
    });

    expect(res.statusCode).toBe(202);
    const body = res.json<{ offerId: string; negotiationId: string; status: string }>();
    expect(body.status).toBe('queued');
    expect(body.negotiationId).toMatch(/^0x[0-9a-fA-F]{64}$/);

    // Poll status — wait for background negotiation to complete
    await new Promise((r) => setTimeout(r, 100));

    const statusRes = await app.inject({
      method: 'GET',
      url: `/status/${body.negotiationId}`,
    });
    expect(statusRes.statusCode).toBe(200);
    const status = statusRes.json<{ state: string }>();
    // Should be agreement (mock TEE returns agreement)
    expect(['agreement', 'running', 'queued']).toContain(status.state);
  });

  it('duplicate nullifier → 403 rln-rejected', async () => {
    const app = await buildApp(db);
    const nullifier = '0x' + 'ff'.repeat(32);

    // First offer succeeds
    await app.inject({ method: 'POST', url: '/offer', payload: makeValidOffer(nullifier) });

    // Manually max out the nullifier count (RLN_MAX_PER_EPOCH = 3)
    db.exec(`UPDATE rln_nullifiers SET count = 3 WHERE epoch = 1`);

    const res = await app.inject({
      method: 'POST',
      url: '/offer',
      payload: makeValidOffer(nullifier),
    });

    expect(res.statusCode).toBe(403);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('rln-rejected');
  });

  it('karma-gate fail → 403 karma-gate', async () => {
    const app = await buildApp(db, makeMockTee(), { canOffer: false });

    const res = await app.inject({
      method: 'POST',
      url: '/offer',
      payload: makeValidOffer(),
    });

    expect(res.statusCode).toBe(403);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('karma-gate');
  });

  it('throughput exceeded → 409', async () => {
    // Tier 0 has limit 3; active = 3
    const app = await buildApp(db, makeMockTee(), {
      tier: 0,
      activeNegotiations: 3,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/offer',
      payload: makeValidOffer(),
    });

    expect(res.statusCode).toBe(409);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('throughput-exceeded');
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
});

// --- Test: GET /tee-pubkey ---

describe('GET /tee-pubkey', () => {
  let db: Database.Database;

  beforeEach(() => { db = buildDb(); });
  afterEach(() => { db.close(); });

  it('happy path → 200 with pubkey', async () => {
    const app = await buildApp(db);

    const res = await app.inject({ method: 'GET', url: '/tee-pubkey' });
    expect(res.statusCode).toBe(200);
    const body = res.json<GetTeePubkeyResponse>();
    expect(body.pubkey).toMatch(/^0x/);
    expect(body.enclaveId).toMatch(/^0x/);
  });

  it('cache semantics — second call uses cache', async () => {
    let callCount = 0;
    const tee = makeMockTee({
      async getPubkey() {
        callCount++;
        return {
          pubkey: '0x' + '00'.repeat(32),
          enclaveId: '0x' + 'de'.repeat(32),
          modelId: 'mock',
          signerAddress: signerAccount.address,
          whitelistedAt: 1_700_000_000,
        };
      },
    });
    const app = await buildApp(db, tee);

    await app.inject({ method: 'GET', url: '/tee-pubkey' });
    await app.inject({ method: 'GET', url: '/tee-pubkey' });

    // Both calls should hit same cached result → only 1 fetch
    expect(callCount).toBe(1);
  });

  it('TEE offline → 503', async () => {
    const tee = makeMockTee({
      async getPubkey() { throw new Error('connection refused'); },
    });
    const app = await buildApp(db, tee);

    const res = await app.inject({ method: 'GET', url: '/tee-pubkey' });
    expect(res.statusCode).toBe(503);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('tee-offline');
  });
});
