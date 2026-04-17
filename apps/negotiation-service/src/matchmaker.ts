// matchmaker.ts — Standing Intents background worker.
//
// Listens for ListingCreated chain events. For each new listing, queries all
// active intents, applies public filters, then ephemerally decrypts the
// intent's buyer conditions and calls NEAR AI to score the match.
//
// PRIVACY INVARIANT: decrypted buyer conditions are NEVER logged, NEVER stored,
// and NEVER returned through any API. They exist only in ephemeral local memory
// during a single match evaluation and are discarded immediately after.
//
// Intent AAD: keccak256("bargo-intent-v1") as bytes32.
// This fixed context distinguishes intent-sealed blobs from listing-bound offer
// blobs (which use buildListingAad(listingId)). Both the service decrypt path
// and the web seal path must use the same 32-byte value.

import type Database from 'better-sqlite3';
import type { FastifyBaseLogger } from 'fastify';
import OpenAI from 'openai';
import { keccak256, toBytes } from 'viem';
import type { WatchContractEventReturnType } from 'viem';
import { open } from '@bargo/crypto';
import { bargoEscrowAbi } from '@bargo/shared';
import type { EncryptedBlob, Hex, IntentId, KarmaTier, ListingId } from '@bargo/shared';
import type { NearAiConfig } from './routes/index.js';
import type { createChainClient } from './chain/read.js';
import {
  getListingById,
  insertIntentMatch,
  listAllActiveIntents,
  bufferToHex,
} from './db/client.js';
import type { IntentRow } from './db/client.js';

// keccak256("bargo-intent-v1") as raw bytes — used as AAD for intent enc blobs.
// Must match exactly what the web client uses when sealing intent blobs.
// Bytes32: 0x<keccak256 of the utf-8 string "bargo-intent-v1">
const INTENT_CONTEXT_STR = 'bargo-intent-v1' as const;
const INTENT_CONTEXT_AAD: Uint8Array = toBytes(keccak256(new TextEncoder().encode(INTENT_CONTEXT_STR) as Uint8Array));

type ChainClient = ReturnType<typeof createChainClient>;

export interface MatchmakerOpts {
  db: Database.Database;
  publicClient: ChainClient;
  escrowAddress: `0x${string}`;
  serviceDecryptSk: Hex;
  nearAi: NearAiConfig;
  log: FastifyBaseLogger;
}

export interface MatchmakerHandle {
  stop(): Promise<void>;
}

interface NearAiMatchResponse {
  score: 'match' | 'likely' | 'uncertain';
  reason: string;
}

function decryptIntentConditions(serviceDecryptSk: Hex, blob: EncryptedBlob): string {
  // Use INTENT_CONTEXT_AAD — a fixed 32-byte context distinct from listing-bound AADs.
  const plaintext = open({ recipientPrivkey: serviceDecryptSk, blob, aad: INTENT_CONTEXT_AAD });
  return new TextDecoder().decode(plaintext);
}

async function callNearAiMatcher(
  nearAi: NearAiConfig,
  listingTitle: string,
  listingCategory: string,
  listingDescription: string,
  buyerConditions: string,
): Promise<NearAiMatchResponse> {
  const client = new OpenAI({ apiKey: nearAi.apiKey, baseURL: nearAi.baseURL });

  const prompt =
    `You evaluate if a buyer's standing intent matches a new listing.\n` +
    `Respond ONLY with JSON: { "score": "match" | "likely" | "uncertain", "reason": "<one short sentence, ≤100 chars, public>" }.\n` +
    `Listing: title "${listingTitle}", category "${listingCategory}", description "${listingDescription.slice(0, 500)}"\n` +
    `Buyer's conditions: "${buyerConditions}"`;

  const completion = await client.chat.completions.create(
    {
      model: nearAi.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 120,
    },
    { timeout: nearAi.timeoutMs },
  );

  const text = completion.choices[0]?.message?.content ?? '{}';
  // Strip markdown code fences if present
  const stripped = text.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
  const parsed = JSON.parse(stripped) as Partial<NearAiMatchResponse>;

  const score = parsed.score;
  if (score !== 'match' && score !== 'likely' && score !== 'uncertain') {
    throw new Error(`Invalid score from NEAR AI: ${String(score)}`);
  }

  return { score, reason: (parsed.reason ?? '').slice(0, 100) };
}

/**
 * Evaluates a single listing against a single intent.
 * Exported for unit testing — callers can exercise this without spinning up a chain watcher.
 * NEVER logs decrypted buyer conditions.
 */
export async function evaluateListingAgainstIntent(opts: {
  db: Database.Database;
  listingId: ListingId;
  requiredKarmaTier: KarmaTier;
  intent: IntentRow;
  serviceDecryptSk: Hex;
  nearAi: NearAiConfig;
  log: FastifyBaseLogger;
}): Promise<void> {
  const { db, listingId, requiredKarmaTier, intent, serviceDecryptSk, nearAi, log } = opts;
  const intentId = bufferToHex(intent.id) as IntentId;

  // Apply public filters
  const filters = JSON.parse(intent.filters_json) as { category?: string; requiredKarmaTierCeiling?: number };
  if (filters.category !== undefined) {
    const listingRow = getListingById(db, listingId);
    if (!listingRow) return;
    const itemMeta = JSON.parse(listingRow.item_meta_json) as { category?: string };
    if (itemMeta.category !== filters.category) return;
  }
  if (
    filters.requiredKarmaTierCeiling !== undefined &&
    requiredKarmaTier > filters.requiredKarmaTierCeiling
  ) {
    return;
  }

  // Fetch full listing for metadata
  const listingRow = getListingById(db, listingId);
  if (!listingRow) {
    log.warn({ listingId, intentId }, 'matchmaker: listing not found in DB, skipping');
    return;
  }
  const itemMeta = JSON.parse(listingRow.item_meta_json) as {
    title: string;
    category: string;
    description: string;
  };

  // Ephemeral decrypt of buyer conditions — NEVER log the result
  let buyerConditions: string;
  try {
    const encBuyerConditions = JSON.parse(intent.enc_buyer_conditions_json) as EncryptedBlob;
    buyerConditions = decryptIntentConditions(serviceDecryptSk, encBuyerConditions);
  } catch (err) {
    log.warn(
      { intentId, listingId, err: err instanceof Error ? err.message : String(err) },
      'matchmaker: failed to decrypt intent conditions, skipping',
    );
    return;
  }

  // Call NEAR AI — conditions variable is local, not logged
  let aiResult: NearAiMatchResponse;
  try {
    aiResult = await callNearAiMatcher(
      nearAi,
      itemMeta.title,
      itemMeta.category,
      itemMeta.description,
      buyerConditions,
    );
  } catch (err) {
    log.warn(
      { intentId, listingId, err: err instanceof Error ? err.message : String(err) },
      'matchmaker: NEAR AI call failed, skipping',
    );
    return;
  } finally {
    // Explicit discard — conditions string goes out of scope here
    buyerConditions = '';
  }

  // Log only public fields — intentId, listingId, score
  log.info({ intentId, listingId, score: aiResult.score }, 'matchmaker: intent evaluated');

  if (aiResult.score !== 'uncertain') {
    insertIntentMatch(db, {
      intentId,
      listingId,
      score: aiResult.score,
      matchReason: aiResult.reason,
    });
    log.info({ intentId, listingId, score: aiResult.score }, 'matchmaker: intent match inserted');
  }
}

async function processListing(opts: {
  db: Database.Database;
  listingId: ListingId;
  requiredKarmaTier: KarmaTier;
  serviceDecryptSk: Hex;
  nearAi: NearAiConfig;
  log: FastifyBaseLogger;
}): Promise<void> {
  const { db, listingId, requiredKarmaTier, serviceDecryptSk, nearAi, log } = opts;

  const intents = listAllActiveIntents(db);
  log.info({ listingId, intentCount: intents.length }, 'matchmaker: processing listing');

  for (const intent of intents) {
    try {
      await evaluateListingAgainstIntent({
        db,
        listingId,
        requiredKarmaTier,
        intent,
        serviceDecryptSk,
        nearAi,
        log,
      });
    } catch (err) {
      log.warn(
        {
          intentId: bufferToHex(intent.id),
          listingId,
          err: err instanceof Error ? err.message : String(err),
        },
        'matchmaker: unexpected error evaluating intent, continuing',
      );
    }
  }
}

export function startMatchmaker(opts: MatchmakerOpts): MatchmakerHandle {
  const { db, publicClient, escrowAddress, serviceDecryptSk, nearAi, log } = opts;

  let stopped = false;

  // Watch ListingCreated events — mirrors startFundsReleasedWatcher pattern
  let unwatch: WatchContractEventReturnType;
  try {
    unwatch = publicClient.watchContractEvent({
      address: escrowAddress,
      abi: bargoEscrowAbi,
      eventName: 'ListingCreated',
      pollingInterval: 5_000,
      onLogs: (logs) => {
        if (stopped) return;
        for (const l of logs) {
          const listingId = l.args.listingId as ListingId | undefined;
          const requiredKarmaTier = l.args.requiredKarmaTier as KarmaTier | undefined;
          if (!listingId || requiredKarmaTier === undefined) {
            log.warn({ log: l }, 'matchmaker: ListingCreated event missing fields, skipping');
            continue;
          }
          processListing({
            db,
            listingId,
            requiredKarmaTier,
            serviceDecryptSk,
            nearAi,
            log,
          }).catch((err) => {
            log.warn(
              { listingId, err: err instanceof Error ? err.message : String(err) },
              'matchmaker: processListing failed',
            );
          });
        }
      },
      onError: (err) => {
        log.warn({ err: err.message }, 'matchmaker: ListingCreated watcher error, will retry');
      },
    });
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'matchmaker: failed to start chain watcher — periodic sweep only',
    );
    // Provide a no-op unwatch so the handle still works
    unwatch = () => undefined;
  }

  // Periodic safety-net sweep — catches any events missed during RPC hiccups
  const sweepInterval = setInterval(
    () => {
      if (stopped) return;
      // Sweep: re-evaluate any listing whose creation is recent (last 120s) against all intents.
      // This is a best-effort safety net; the chain watcher handles real-time coverage.
      // We scan DB listings created in the last 2 minutes and re-run match evaluation.
      // Using raw SQL for simplicity (no new DB helper needed for a sweep).
      try {
        const cutoff = Math.floor(Date.now() / 1000) - 120;
        const recentRows = db
          .prepare<[number], { id: Buffer; required_karma_tier: number }>(
            `SELECT id, required_karma_tier FROM listings WHERE created_at >= ? AND status = 'open'`,
          )
          .all(cutoff);

        for (const row of recentRows) {
          const listingId = bufferToHex(row.id) as ListingId;
          const requiredKarmaTier = row.required_karma_tier as KarmaTier;
          processListing({
            db,
            listingId,
            requiredKarmaTier,
            serviceDecryptSk,
            nearAi,
            log,
          }).catch((err) => {
            log.warn(
              { listingId, err: err instanceof Error ? err.message : String(err) },
              'matchmaker sweep: processListing failed',
            );
          });
        }
      } catch (err) {
        log.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'matchmaker: periodic sweep error',
        );
      }
    },
    60_000, // every 60 seconds
  );

  log.info('matchmaker started');

  return {
    async stop(): Promise<void> {
      stopped = true;
      clearInterval(sweepInterval);
      unwatch();
      log.info('matchmaker stopped');
    },
  };
}
