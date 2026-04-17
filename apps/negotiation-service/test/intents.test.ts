// Intents route integration tests — uses Fastify's .inject() (no real HTTP).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EncryptedBlob, KarmaTier } from '@bargo/shared';
import cors from '@fastify/cors';
import Database from 'better-sqlite3';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerRoutes } from '../src/routes/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Minimal mocks to satisfy registerRoutes ---
vi.mock('../src/negotiate/engine.js', () => ({
  runNegotiation: vi.fn().mockResolvedValue({ kind: 'fail', reason: 'no_price_zopa' }),
}));
vi.mock('../src/chain/relayer.js', () => ({
  submitSettlement: vi.fn().mockResolvedValue(`0x${'ab'.repeat(32)}`),
}));
vi.mock('../src/nearai/attestation.js', () => ({
  saveAttestationBundle: vi.fn().mockReturnValue('/tmp/test.json'),
  loadAttestationBundle: vi.fn().mockReturnValue(null),
  fetchAttestation: vi.fn(),
  computeNonce: vi.fn(),
  hashBundle: vi.fn(),
  canonicalizeBundle: vi.fn(),
  runStartupAttestationCheck: vi.fn(),
}));
vi.mock('../src/chain/verifyIds.js', () => ({
  verifyListingOnChain: vi
    .fn()
    .mockResolvedValue({ seller: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' }),
  verifyOfferOnChain: vi
    .fn()
    .mockResolvedValue({ buyer: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' }),
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

function makeChainDeps() {
  return {
    client: {
      readContract: vi.fn().mockImplementation(({ functionName }: { functionName: string }) => {
        if (functionName === 'canOffer') return Promise.resolve(true);
        if (functionName === 'getTier') return Promise.resolve(0 as KarmaTier);
        if (functionName === 'activeNegotiations') return Promise.resolve(BigInt(0));
        return Promise.resolve(null);
      }),
    } as unknown as import('../src/chain/read.js').createChainClient extends (
      ...args: infer _
    ) => infer R
      ? R
      : never,
    karmaReaderAddress: '0x0000000000000000000000000000000000000001' as const,
    bargoEscrowAddress: '0x0000000000000000000000000000000000000002' as const,
    rpcUrl: 'http://localhost:8545',
  };
}

const RELAYER_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const SERVICE_DECRYPT_SK = `0x${'00'.repeat(31)}42` as const;
const SERVICE_PUBKEY = `0x${'ab'.repeat(32)}` as const;
const BUYER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;
const OTHER_BUYER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

function makeBlob(tag: string): EncryptedBlob {
  return {
    v: 1,
    ephPub: `0x${'a0'.repeat(32)}` as `0x${string}`,
    nonce: `0x${'b0'.repeat(24)}` as `0x${string}`,
    ct: `0x${tag.repeat(4)}` as `0x${string}`,
  };
}

async function buildApp(db: Database.Database) {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  await registerRoutes(app, {
    db,
    chain: makeChainDeps() as Parameters<typeof registerRoutes>[1]['chain'],
    nearAi: {
      apiKey: 'test-key',
      baseURL: 'https://cloud-api.near.ai/v1',
      model: 'qwen3-30b',
      timeoutMs: 8000,
    },
    relayerPrivateKey: RELAYER_PK,
    bargoEscrowAddress: '0x0000000000000000000000000000000000000002',
    attestationDir: '/tmp/test-attestations',
    serviceDecryptSk: SERVICE_DECRYPT_SK,
    servicePubkey: SERVICE_PUBKEY,
  });
  return app;
}

function makeValidIntent(overrides?: {
  buyer?: string;
  category?: string;
  requiredKarmaTierCeiling?: number;
}) {
  return {
    buyer: overrides?.buyer ?? BUYER,
    encMaxBuy: makeBlob('33'),
    encBuyerConditions: makeBlob('44'),
    filters:
      overrides?.category !== undefined
        ? {
            category: overrides.category,
            requiredKarmaTierCeiling: overrides?.requiredKarmaTierCeiling ?? 3,
          }
        : {},
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
}

// --- Tests ---

describe('POST /intents', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = buildDb();
  });
  afterEach(() => {
    db.close();
  });

  it('happy path → 201 with intentId', async () => {
    const app = await buildApp(db);

    const res = await app.inject({
      method: 'POST',
      url: '/intents',
      payload: makeValidIntent(),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ intentId: string }>();
    expect(body.intentId).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it('row in DB — enc blobs stored, no plaintext', async () => {
    const app = await buildApp(db);

    const res = await app.inject({
      method: 'POST',
      url: '/intents',
      payload: makeValidIntent(),
    });

    const { intentId } = res.json<{ intentId: string }>();
    const row = db
      .prepare('SELECT * FROM intents WHERE id = ?')
      .get(Buffer.from(intentId.slice(2), 'hex')) as Record<string, unknown> | undefined;

    expect(row).toBeTruthy();
    expect(typeof row?.enc_max_buy_json).toBe('string');
    expect(typeof row?.enc_buyer_conditions_json).toBe('string');
    expect(row?.active).toBe(1);
    expect(row?.buyer).toBe(BUYER);
  });

  it('with category filter → 201', async () => {
    const app = await buildApp(db);

    const res = await app.inject({
      method: 'POST',
      url: '/intents',
      payload: makeValidIntent({ category: 'electronics', requiredKarmaTierCeiling: 2 }),
    });

    expect(res.statusCode).toBe(201);
  });

  it('missing encMaxBuy → 400', async () => {
    const app = await buildApp(db);
    const payload = { ...makeValidIntent(), encMaxBuy: undefined };

    const res = await app.inject({ method: 'POST', url: '/intents', payload });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('bad-request');
  });

  it('missing buyer → 400', async () => {
    const app = await buildApp(db);
    const payload = { ...makeValidIntent(), buyer: undefined };

    const res = await app.inject({ method: 'POST', url: '/intents', payload });

    expect(res.statusCode).toBe(400);
  });
});

describe('GET /intents', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = buildDb();
    const app = await buildApp(db);
    // Use different enc blobs to get distinct intentIds
    await app.inject({ method: 'POST', url: '/intents', payload: makeValidIntent() });
    await app.inject({
      method: 'POST',
      url: '/intents',
      payload: { ...makeValidIntent(), encMaxBuy: makeBlob('55') },
    });
    // Different buyer
    await app.inject({
      method: 'POST',
      url: '/intents',
      payload: makeValidIntent({ buyer: OTHER_BUYER }),
    });
  });
  afterEach(() => {
    db.close();
  });

  it('returns active intents for buyer', async () => {
    const app = await buildApp(db);

    const res = await app.inject({ method: 'GET', url: `/intents?buyer=${BUYER}` });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ intents: unknown[] }>();
    expect(body.intents).toHaveLength(2);
  });

  it('returns only buyer-owned intents — no enc blobs in response', async () => {
    const app = await buildApp(db);

    const res = await app.inject({ method: 'GET', url: `/intents?buyer=${BUYER}` });

    const body = res.json<{ intents: Record<string, unknown>[] }>();
    for (const intent of body.intents) {
      expect(intent).not.toHaveProperty('enc_max_buy_json');
      expect(intent).not.toHaveProperty('encMaxBuy');
      expect(intent).not.toHaveProperty('enc_buyer_conditions_json');
      expect(intent).toHaveProperty('id');
      expect(intent).toHaveProperty('buyer');
      expect(intent).toHaveProperty('filters');
      expect(intent).toHaveProperty('expiresAt');
      expect(intent).toHaveProperty('createdAt');
      expect(intent).toHaveProperty('active');
    }
  });

  it('invalid buyer → 400', async () => {
    const app = await buildApp(db);

    const res = await app.inject({ method: 'GET', url: '/intents?buyer=not-an-address' });

    expect(res.statusCode).toBe(400);
  });

  it('missing buyer → 400', async () => {
    const app = await buildApp(db);

    const res = await app.inject({ method: 'GET', url: '/intents' });

    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /intents/:id', () => {
  let db: Database.Database;
  let intentId: string;

  beforeEach(async () => {
    db = buildDb();
    const app = await buildApp(db);
    const res = await app.inject({
      method: 'POST',
      url: '/intents',
      payload: makeValidIntent(),
    });
    intentId = res.json<{ intentId: string }>().intentId;
  });
  afterEach(() => {
    db.close();
  });

  it('deactivates intent when buyer matches', async () => {
    const app = await buildApp(db);

    const res = await app.inject({
      method: 'DELETE',
      url: `/intents/${intentId}?buyer=${BUYER}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ ok: boolean }>().ok).toBe(true);

    // Confirm DB row is inactive
    const row = db
      .prepare('SELECT active FROM intents WHERE id = ?')
      .get(Buffer.from(intentId.slice(2), 'hex')) as { active: number } | undefined;
    expect(row?.active).toBe(0);
  });

  it('wrong buyer → 404', async () => {
    const app = await buildApp(db);

    const res = await app.inject({
      method: 'DELETE',
      url: `/intents/${intentId}?buyer=${OTHER_BUYER}`,
    });

    expect(res.statusCode).toBe(404);
  });

  it('missing buyer → 400', async () => {
    const app = await buildApp(db);

    const res = await app.inject({ method: 'DELETE', url: `/intents/${intentId}` });

    expect(res.statusCode).toBe(400);
  });

  it('invalid id format → 400', async () => {
    const app = await buildApp(db);

    const res = await app.inject({
      method: 'DELETE',
      url: `/intents/not-valid?buyer=${BUYER}`,
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('GET /intent-matches', () => {
  let db: Database.Database;
  let intentId: string;
  const LISTING_ID = `0x${'a1'.repeat(32)}` as const;

  beforeEach(async () => {
    db = buildDb();
    const app = await buildApp(db);

    // Create an intent
    const intentRes = await app.inject({
      method: 'POST',
      url: '/intents',
      payload: makeValidIntent(),
    });
    intentId = intentRes.json<{ intentId: string }>().intentId;

    // Seed a listing in DB directly
    db.prepare(
      `INSERT INTO listings (id, seller, required_karma_tier, item_meta_json, enc_min_sell_json, enc_seller_conditions_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
    ).run(
      Buffer.from(LISTING_ID.slice(2), 'hex'),
      OTHER_BUYER,
      0,
      JSON.stringify({ title: 'Test', description: 'Desc', category: 'electronics', images: [] }),
      '{}',
      '{}',
      Math.floor(Date.now() / 1000),
    );

    // Seed an intent match
    db.prepare(
      `INSERT INTO intent_matches (intent_id, listing_id, score, match_reason, matched_at, acknowledged)
       VALUES (?, ?, ?, ?, ?, 0)`,
    ).run(
      Buffer.from(intentId.slice(2), 'hex'),
      Buffer.from(LISTING_ID.slice(2), 'hex'),
      'match',
      'Good fit based on conditions',
      Math.floor(Date.now() / 1000),
    );
  });
  afterEach(() => {
    db.close();
  });

  it('returns matches for buyer', async () => {
    const app = await buildApp(db);

    const res = await app.inject({ method: 'GET', url: `/intent-matches?buyer=${BUYER}` });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ matches: unknown[] }>();
    expect(body.matches).toHaveLength(1);
  });

  it('match fields include public metadata', async () => {
    const app = await buildApp(db);

    const res = await app.inject({ method: 'GET', url: `/intent-matches?buyer=${BUYER}` });
    const { matches } = res.json<{
      matches: Array<{
        intentId: string;
        listingId: string;
        score: string;
        matchReason: string;
        acknowledged: boolean;
      }>;
    }>();

    const m = matches[0];
    expect(m?.intentId).toBe(intentId);
    expect(m?.listingId).toBe(LISTING_ID);
    expect(m?.score).toBe('match');
    expect(m?.acknowledged).toBe(false);
  });

  it('missing buyer → 400', async () => {
    const app = await buildApp(db);

    const res = await app.inject({ method: 'GET', url: '/intent-matches' });

    expect(res.statusCode).toBe(400);
  });
});

describe('POST /intent-matches/ack', () => {
  let db: Database.Database;
  let intentId: string;
  const LISTING_ID = `0x${'a1'.repeat(32)}` as const;

  beforeEach(async () => {
    db = buildDb();
    const app = await buildApp(db);

    const intentRes = await app.inject({
      method: 'POST',
      url: '/intents',
      payload: makeValidIntent(),
    });
    intentId = intentRes.json<{ intentId: string }>().intentId;

    db.prepare(
      `INSERT INTO listings (id, seller, required_karma_tier, item_meta_json, enc_min_sell_json, enc_seller_conditions_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
    ).run(
      Buffer.from(LISTING_ID.slice(2), 'hex'),
      OTHER_BUYER,
      0,
      JSON.stringify({ title: 'Test', description: 'Desc', category: 'electronics', images: [] }),
      '{}',
      '{}',
      Math.floor(Date.now() / 1000),
    );

    db.prepare(
      `INSERT INTO intent_matches (intent_id, listing_id, score, match_reason, matched_at, acknowledged)
       VALUES (?, ?, ?, ?, ?, 0)`,
    ).run(
      Buffer.from(intentId.slice(2), 'hex'),
      Buffer.from(LISTING_ID.slice(2), 'hex'),
      'likely',
      'Likely match',
      Math.floor(Date.now() / 1000),
    );
  });
  afterEach(() => {
    db.close();
  });

  it('marks match as acknowledged', async () => {
    const app = await buildApp(db);

    const res = await app.inject({
      method: 'POST',
      url: '/intent-matches/ack',
      payload: { intentId, listingId: LISTING_ID },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ ok: boolean }>().ok).toBe(true);

    const row = db
      .prepare('SELECT acknowledged FROM intent_matches WHERE intent_id = ? AND listing_id = ?')
      .get(Buffer.from(intentId.slice(2), 'hex'), Buffer.from(LISTING_ID.slice(2), 'hex')) as
      | { acknowledged: number }
      | undefined;
    expect(row?.acknowledged).toBe(1);
  });

  it('invalid intentId → 400', async () => {
    const app = await buildApp(db);

    const res = await app.inject({
      method: 'POST',
      url: '/intent-matches/ack',
      payload: { intentId: 'not-hex', listingId: LISTING_ID },
    });

    expect(res.statusCode).toBe(400);
  });
});
