// chain/watcher.ts — PLAN_V2 §7 Task 1.4
// Watches FundsReleased events on BargoEscrow.
// On event: sets negotiations.state = 'completed', which fires the SQLite
// purge trigger to NULL plaintext_min_sell / plaintext_max_buy / etc.

import { bargoEscrowAbi } from '@bargo/shared';
import type { DealId, ListingId } from '@bargo/shared';
import type Database from 'better-sqlite3';
import type { FastifyBaseLogger } from 'fastify';
import type { WatchContractEventReturnType } from 'viem';
import {
  bufferToHex,
  getNegotiationById,
  updateListingStatus,
  updateNegotiationState,
} from '../db/client.js';
import type { createChainClient } from './read.js';

type ChainClient = ReturnType<typeof createChainClient>;

/**
 * Start watching FundsReleased on the escrow contract.
 * Returns an unwatch function — call it on process shutdown.
 */
export function startFundsReleasedWatcher(
  client: ChainClient,
  escrowAddress: `0x${string}`,
  db: Database.Database,
  log: FastifyBaseLogger,
): WatchContractEventReturnType {
  const unwatch = client.watchContractEvent({
    address: escrowAddress,
    abi: bargoEscrowAbi,
    eventName: 'FundsReleased',
    pollingInterval: 3_000,
    onLogs: (logs) => {
      for (const l of logs) {
        const dealId = l.args.dealId as DealId | undefined;
        if (!dealId) {
          log.warn({ log: l }, 'FundsReleased event missing dealId — skipping');
          continue;
        }
        try {
          updateNegotiationState(db, dealId, 'completed');
          // Close the associated listing so it drops off the feed and stops
          // matching future intents. Negotiation row may be missing if this
          // watcher fires before the deal was settled through our service.
          const negotiation = getNegotiationById(db, dealId);
          if (negotiation) {
            const listingId = bufferToHex(negotiation.listing_id) as ListingId;
            updateListingStatus(db, listingId, 'settled');
            log.info({ dealId, listingId }, 'deal completed — listing marked settled');
          } else {
            log.info({ dealId }, 'deal completed — no negotiation row, listing untouched');
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error(
            { dealId, err: msg },
            'failed to mark negotiation completed after FundsReleased',
          );
        }
      }
    },
    onError: (err) => {
      log.error({ err: err.message }, 'FundsReleased watcher error');
    },
  });

  return unwatch;
}
