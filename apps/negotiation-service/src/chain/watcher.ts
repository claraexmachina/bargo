// chain/watcher.ts — PLAN_V2 §7 Task 1.4
// Watches FundsReleased events on HaggleEscrow.
// On event: sets negotiations.state = 'completed', which fires the SQLite
// purge trigger to NULL plaintext_min_sell / plaintext_max_buy / etc.

import type { WatchContractEventReturnType } from 'viem';
import { haggleEscrowAbi } from '@haggle/shared';
import type { DealId } from '@haggle/shared';
import { updateNegotiationState } from '../db/client.js';
import type Database from 'better-sqlite3';
import type { createChainClient } from './read.js';
import type { FastifyBaseLogger } from 'fastify';

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
    abi: haggleEscrowAbi,
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
          log.info({ dealId }, 'deal completed — plaintext purged by trigger');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error({ dealId, err: msg }, 'failed to mark negotiation completed after FundsReleased');
        }
      }
    },
    onError: (err) => {
      log.error({ err: err.message }, 'FundsReleased watcher error');
    },
  });

  return unwatch;
}
