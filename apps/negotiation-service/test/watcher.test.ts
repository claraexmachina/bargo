// Watcher smoke test — mocks viem watchContractEvent, emits a fake FundsReleased log,
// and asserts the negotiations row's state is updated to 'completed'.
// V3: no plaintext columns exist; enc blobs are cryptographically safe to retain.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { createChainClient } from '../src/chain/read.js';
import { startFundsReleasedWatcher } from '../src/chain/watcher.js';
import { hexToBuffer } from '../src/db/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── helpers ───

function buildDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = readFileSync(join(__dirname, '../src/db/schema.sql'), 'utf-8');
  db.exec(schema);
  return db;
}

// Minimal enc blob JSON for seeding
const ENC_BLOB_JSON = JSON.stringify({
  v: 1,
  ephPub: `0x${'a0'.repeat(32)}`,
  nonce: `0x${'b0'.repeat(24)}`,
  ct: `0x${'c0'.repeat(4)}`,
});

// Minimal listing + offer + negotiation so foreign keys don't block.
function seedNegotiation(
  db: Database.Database,
  listingId: `0x${string}`,
  offerId: `0x${string}`,
  negotiationId: `0x${string}`,
): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT INTO listings (id, seller, required_karma_tier, item_meta_json,
      enc_min_sell_json, enc_seller_conditions_json, status, created_at)
    VALUES (?, '0xseller', 0, '{}', ?, ?, 'open', ?)
  `).run(hexToBuffer(listingId), ENC_BLOB_JSON, ENC_BLOB_JSON, now);

  db.prepare(`
    INSERT INTO offers (id, listing_id, buyer, enc_max_buy_json,
      enc_buyer_conditions_json, rln_nullifier, rln_epoch, status, created_at)
    VALUES (?, ?, '0xbuyer', ?, ?, ?, 1, 'pending', ?)
  `).run(
    hexToBuffer(offerId),
    hexToBuffer(listingId),
    ENC_BLOB_JSON,
    ENC_BLOB_JSON,
    hexToBuffer(`0x${'ee'.repeat(32)}`),
    now,
  );

  db.prepare(`
    INSERT INTO negotiations (id, listing_id, offer_id, state, created_at, updated_at)
    VALUES (?, ?, ?, 'settled', ?, ?)
  `).run(hexToBuffer(negotiationId), hexToBuffer(listingId), hexToBuffer(offerId), now, now);
}

// ─── tests ───

describe('startFundsReleasedWatcher', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = buildDb();
  });

  it('sets negotiations state to completed on FundsReleased', async () => {
    const listingId = `0x${'aa'.repeat(32)}` as `0x${string}`;
    const offerId = `0x${'bb'.repeat(32)}` as `0x${string}`;
    const negotiationId = `0x${'cc'.repeat(32)}` as `0x${string}`;

    seedNegotiation(db, listingId, offerId, negotiationId);

    // Capture the onLogs callback registered by watchContractEvent
    let capturedOnLogs: ((logs: unknown[]) => void) | undefined;

    const mockClient = {
      watchContractEvent: vi
        .fn()
        .mockImplementation((opts: { onLogs: (logs: unknown[]) => void }) => {
          capturedOnLogs = opts.onLogs;
          // Return a no-op unwatch
          return () => {};
        }),
    } as unknown as ReturnType<typeof createChainClient>;

    const mockLog = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as import('fastify').FastifyBaseLogger;

    startFundsReleasedWatcher(
      mockClient,
      '0x0000000000000000000000000000000000000001',
      db,
      mockLog,
    );

    // Confirm watchContractEvent was called
    expect(mockClient.watchContractEvent).toHaveBeenCalledOnce();
    expect(capturedOnLogs).toBeDefined();

    // Emit a fake FundsReleased log
    capturedOnLogs?.([
      {
        args: {
          dealId: negotiationId,
          seller: '0xseller',
          amount: 1000n,
        },
      },
    ]);

    // negotiation state should be 'completed'
    const neg = db
      .prepare('SELECT state FROM negotiations WHERE id = ?')
      .get(hexToBuffer(negotiationId)) as { state: string };
    expect(neg.state).toBe('completed');

    // V3: enc blobs are retained at rest (no purge needed — they're cryptographically sealed)
    const listing = db
      .prepare('SELECT enc_min_sell_json, enc_seller_conditions_json FROM listings WHERE id = ?')
      .get(hexToBuffer(listingId)) as {
      enc_min_sell_json: string;
      enc_seller_conditions_json: string;
    };
    expect(listing.enc_min_sell_json).toBeTruthy();
    expect(listing.enc_seller_conditions_json).toBeTruthy();
  });

  it('logs warn and continues when dealId is missing from log args', () => {
    let capturedOnLogs: ((logs: unknown[]) => void) | undefined;

    const mockClient = {
      watchContractEvent: vi
        .fn()
        .mockImplementation((opts: { onLogs: (logs: unknown[]) => void }) => {
          capturedOnLogs = opts.onLogs;
          return () => {};
        }),
    } as unknown as ReturnType<typeof createChainClient>;

    const mockLog = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as import('fastify').FastifyBaseLogger;

    startFundsReleasedWatcher(
      mockClient,
      '0x0000000000000000000000000000000000000001',
      db,
      mockLog,
    );

    // Log with missing dealId — should not throw
    capturedOnLogs?.([{ args: {} }]);

    expect(mockLog.warn).toHaveBeenCalledOnce();
  });
});
