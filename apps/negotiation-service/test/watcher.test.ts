// Watcher smoke test — mocks viem watchContractEvent, emits a fake FundsReleased log,
// and asserts the negotiations row's plaintext columns are NULLed afterwards.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { createChainClient } from '../src/chain/read.js';
import { startFundsReleasedWatcher } from '../src/chain/watcher.js';
import { bufferToHex, hexToBuffer } from '../src/db/client.js';

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

// Minimal listing + offer + negotiation so foreign keys don't block.
function seedNegotiation(
  db: Database.Database,
  listingId: `0x${string}`,
  offerId: `0x${string}`,
  negotiationId: `0x${string}`,
): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT INTO listings (id, seller, ask_price, required_karma_tier, item_meta_json,
      plaintext_min_sell, plaintext_seller_conditions, status, created_at)
    VALUES (?, '0xseller', '1000', 0, '{}', '800', 'seller conds', 'open', ?)
  `).run(hexToBuffer(listingId), now);

  db.prepare(`
    INSERT INTO offers (id, listing_id, buyer, bid_price, plaintext_max_buy,
      plaintext_buyer_conditions, rln_nullifier, rln_epoch, status, created_at)
    VALUES (?, ?, '0xbuyer', '900', '950', 'buyer conds', ?, 1, 'pending', ?)
  `).run(hexToBuffer(offerId), hexToBuffer(listingId), hexToBuffer(`0x${'ee'.repeat(32)}`), now);

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

  it('sets negotiations state to completed and NULLs plaintext columns on FundsReleased', async () => {
    const listingId = `0x${'aa'.repeat(32)}` as `0x${string}`;
    const offerId = `0x${'bb'.repeat(32)}` as `0x${string}`;
    const negotiationId = `0x${'cc'.repeat(32)}` as `0x${string}`;

    seedNegotiation(db, listingId, offerId, negotiationId);

    // Verify plaintext is present before watcher fires
    const beforeListing = db
      .prepare('SELECT plaintext_min_sell FROM listings WHERE id = ?')
      .get(hexToBuffer(listingId)) as { plaintext_min_sell: string | null };
    expect(beforeListing.plaintext_min_sell).toBe('800');

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

    // Trigger should have NULLed plaintext columns on listing and offer
    const listing = db
      .prepare('SELECT plaintext_min_sell, plaintext_seller_conditions FROM listings WHERE id = ?')
      .get(hexToBuffer(listingId)) as {
      plaintext_min_sell: string | null;
      plaintext_seller_conditions: string | null;
    };
    expect(listing.plaintext_min_sell).toBeNull();
    expect(listing.plaintext_seller_conditions).toBeNull();

    const offer = db
      .prepare('SELECT plaintext_max_buy, plaintext_buyer_conditions FROM offers WHERE id = ?')
      .get(hexToBuffer(offerId)) as {
      plaintext_max_buy: string | null;
      plaintext_buyer_conditions: string | null;
    };
    expect(offer.plaintext_max_buy).toBeNull();
    expect(offer.plaintext_buyer_conditions).toBeNull();
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
