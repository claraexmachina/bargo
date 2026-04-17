// POST /offer
// Validates RLN proof, checks Karma gate, inserts offer, fires engine negotiation.
// Returns 202 immediately; client polls GET /status/:negotiationId.
//
// offerId:  provided by caller (on-chain id from buyer's submitOffer tx)
// dealId:   keccak256(abiEncodePacked(['bytes32','bytes32'], [listingId, offerId]))
//           — matches BargoEscrow.settleNegotiation's dealId derivation

import type { FastifyInstance } from 'fastify';
import { keccak256, encodePacked } from 'viem';
import { postOfferRequestSchema, THROUGHPUT_LIMITS } from '@bargo/shared';
import type { KarmaTier, DealId, ListingId, OfferId } from '@bargo/shared';
import {
  insertOffer,
  createNegotiation,
  updateNegotiationState,
  updateNegotiationAttestation,
  getListingById,
  bufferToHex,
} from '../db/client.js';
import { verifyRlnProof } from '../rln/verify.js';
import { canOffer, getActiveNegotiations, getTier } from '../chain/read.js';
import { verifyOfferOnChain } from '../chain/verifyIds.js';
import { runNegotiation } from '../negotiate/engine.js';
import { submitSettlement } from '../chain/relayer.js';
import type Database from 'better-sqlite3';
import type { ChainDeps } from './index.js';
import type { NearAiConfig } from './index.js';

// In-memory lock: prevents duplicate concurrent /offer requests for the same (buyer, listingId).
// Key: `${buyer}:${listingId}`. Cleared when the negotiation finishes (success or fail).
const _inFlightNegotiations = new Set<string>();

export async function offerRoutes(
  app: FastifyInstance,
  opts: {
    db: Database.Database;
    chain: ChainDeps;
    nearAi: NearAiConfig;
    relayerPrivateKey: `0x${string}`;
    bargoEscrowAddress: `0x${string}`;
    attestationDir: string;
  },
) {
  app.post('/offer', async (request, reply) => {
    const result = postOfferRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        error: { code: 'bad-request', message: result.error.issues[0]?.message ?? 'Invalid request body' },
      });
    }

    const body = result.data;

    // 1. Verify RLN proof (nullifier dedupe + epoch limit)
    const rlnResult = verifyRlnProof(opts.db, body.rlnProof);
    if (!rlnResult.ok) {
      app.log.warn({ buyer: body.buyer, reason: rlnResult.reason }, 'RLN rejected');
      return reply.code(403).send({
        error: { code: 'rln-rejected', message: `RLN proof rejected: ${rlnResult.reason}` },
      });
    }

    // 2. Load listing (must exist)
    const listing = getListingById(opts.db, body.listingId);
    if (!listing) {
      return reply.code(404).send({
        error: { code: 'listing-not-found', message: 'Listing not found' },
      });
    }

    // 3. Karma gate
    const offerAllowed = await canOffer(
      opts.chain.client,
      opts.chain.karmaReaderAddress,
      body.buyer,
      listing.required_karma_tier as KarmaTier,
    );
    if (!offerAllowed) {
      app.log.warn({ buyer: body.buyer, listingId: body.listingId }, 'karma-gate: canOffer false');
      return reply.code(403).send({
        error: { code: 'karma-gate', message: 'Karma tier insufficient for this listing' },
      });
    }

    // 4. Throughput check
    const buyerTier = await getTier(opts.chain.client, opts.chain.karmaReaderAddress, body.buyer);
    const limit = THROUGHPUT_LIMITS[buyerTier] ?? THROUGHPUT_LIMITS[0];
    const active = await getActiveNegotiations(
      opts.chain.client,
      opts.chain.bargoEscrowAddress,
      body.buyer,
    );
    if (active >= limit) {
      app.log.warn({ buyer: body.buyer, active, limit }, 'throughput exceeded');
      return reply.code(409).send({
        error: { code: 'throughput-exceeded', message: `Active negotiations limit reached (${limit} for tier ${buyerTier})` },
      });
    }

    // 5. Concurrency guard — reject duplicate in-flight (buyer, listingId) pairs
    const inflightKey = `${body.buyer}:${body.listingId}`;
    if (_inFlightNegotiations.has(inflightKey)) {
      app.log.warn({ buyer: body.buyer, listingId: body.listingId }, 'duplicate offer in-flight');
      return reply.code(409).send({
        error: { code: 'negotiation-in-flight', message: 'A negotiation for this listing is already in progress' },
      });
    }

    // 6. Verify offerId exists on-chain (BLOCKER A1 fix)
    //    offerId comes from buyer's on-chain submitOffer tx; service trusts the chain, not its own counter.
    const offerId = body.offerId as OfferId;
    try {
      await verifyOfferOnChain(opts.chain.client, opts.chain.bargoEscrowAddress, offerId);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'onchain-offer-not-found') {
        app.log.warn({ offerId, buyer: body.buyer }, 'offerId not found on-chain');
        return reply.code(400).send({
          error: { code: 'onchain-offer-not-found', message: 'Offer not found on-chain — submit the transaction first' },
        });
      }
      throw err;
    }

    // 7. Derive negotiationId = keccak256(listingId || offerId) — same as contract's dealId
    const negotiationId = keccak256(
      encodePacked(['bytes32', 'bytes32'], [body.listingId, offerId]),
    ) as DealId;

    // 8. Insert offer + create negotiation (state: queued)
    insertOffer(opts.db, {
      id: offerId,
      listingId: body.listingId as ListingId,
      buyer: body.buyer,
      bidPrice: body.bidPrice,
      plaintextMaxBuy: body.plaintextMaxBuy,
      plaintextBuyerConditions: body.plaintextBuyerConditions,
      rlnNullifier: body.rlnProof.nullifier,
      rlnEpoch: body.rlnProof.epoch,
    });

    createNegotiation(opts.db, {
      id: negotiationId,
      listingId: body.listingId as ListingId,
      offerId,
    });

    // 9. Load seller tier for engine
    const sellerTier = await getTier(
      opts.chain.client,
      opts.chain.karmaReaderAddress,
      listing.seller as `0x${string}`,
    );

    const itemMeta = JSON.parse(listing.item_meta_json) as { title: string };

    // 10. Acquire in-flight lock then fire-and-forget
    _inFlightNegotiations.add(inflightKey);
    void fireNegotiation({
      db: opts.db,
      negotiationId,
      listingId: body.listingId as ListingId,
      offerId,
      listingTitle: itemMeta.title,
      sellerPlaintextMin: listing.plaintext_min_sell ?? '',
      sellerPlaintextConditions: listing.plaintext_seller_conditions ?? '',
      buyerPlaintextMax: body.plaintextMaxBuy,
      buyerPlaintextConditions: body.plaintextBuyerConditions,
      sellerKarmaTier: sellerTier,
      buyerKarmaTier: buyerTier,
      nearAiApiKey: opts.nearAi.apiKey,
      nearAiBaseURL: opts.nearAi.baseURL,
      nearAiModel: opts.nearAi.model,
      nearAiTimeoutMs: opts.nearAi.timeoutMs,
      attestationDir: opts.attestationDir,
      relayerPrivateKey: opts.relayerPrivateKey,
      bargoEscrowAddress: opts.bargoEscrowAddress,
      hoodiRpcUrl: opts.chain.rpcUrl,
      log: app.log,
      inflightKey,
    });

    return reply.code(202).send({
      offerId,
      negotiationId,
      status: 'queued',
    });
  });
}

interface FireNegotiationParams {
  db: Database.Database;
  negotiationId: DealId;
  listingId: ListingId;
  offerId: OfferId;
  listingTitle: string;
  sellerPlaintextMin: string;
  sellerPlaintextConditions: string;
  buyerPlaintextMax: string;
  buyerPlaintextConditions: string;
  sellerKarmaTier: KarmaTier;
  buyerKarmaTier: KarmaTier;
  nearAiApiKey: string;
  nearAiBaseURL: string;
  nearAiModel: string;
  nearAiTimeoutMs: number;
  attestationDir: string;
  relayerPrivateKey: `0x${string}`;
  bargoEscrowAddress: `0x${string}`;
  hoodiRpcUrl: string;
  log: FastifyInstance['log'];
  inflightKey: string;
}

async function fireNegotiation(p: FireNegotiationParams): Promise<void> {
  try {
    updateNegotiationState(p.db, p.negotiationId, 'running');

    const result = await runNegotiation({
      dealId: p.negotiationId,
      listingId: p.listingId,
      offerId: p.offerId,
      listingTitle: p.listingTitle,
      sellerPlaintextMin: p.sellerPlaintextMin,
      sellerPlaintextConditions: p.sellerPlaintextConditions,
      buyerPlaintextMax: p.buyerPlaintextMax,
      buyerPlaintextConditions: p.buyerPlaintextConditions,
      sellerKarmaTier: p.sellerKarmaTier,
      buyerKarmaTier: p.buyerKarmaTier,
      nearAiApiKey: p.nearAiApiKey,
      nearAiBaseURL: p.nearAiBaseURL,
      nearAiModel: p.nearAiModel,
      nearAiTimeoutMs: p.nearAiTimeoutMs,
      attestationDir: p.attestationDir,
    });

    if (result.kind === 'fail') {
      updateNegotiationState(p.db, p.negotiationId, 'fail', { failureReason: result.reason });
      p.log.info({ negotiationId: p.negotiationId, reason: result.reason }, 'negotiation failed');
      return;
    }

    // Agreement — persist attestation metadata
    const { attestation, bundle: _bundle, attestationBundlePath } = result;

    updateNegotiationAttestation(p.db, p.negotiationId, {
      agreedConditionsHash: attestation.agreedConditionsHash, // distinct from nearAiAttestationHash
      nearAiAttestationHash: attestation.nearAiAttestationHash,
      agreedConditionsJson: JSON.stringify(attestation.agreedConditions),
      modelId: attestation.modelId,
      completionId: attestation.completionId,
      attestationBundlePath,
    });

    updateNegotiationState(p.db, p.negotiationId, 'agreement', { attestation });
    p.log.info({ negotiationId: p.negotiationId }, 'negotiation agreement reached');

    // Submit on-chain settlement
    let txHash: `0x${string}` | undefined;
    try {
      txHash = await submitSettlement({
        dealId: p.negotiationId,
        listingId: p.listingId,
        offerId: p.offerId,
        agreedPriceWei: BigInt(attestation.agreedPrice),
        agreedConditionsHash: attestation.agreedConditionsHash, // correct distinct field
        nearAiAttestationHash: attestation.nearAiAttestationHash,
        relayerPrivateKey: p.relayerPrivateKey,
        rpcUrl: p.hoodiRpcUrl,
        escrowAddress: p.bargoEscrowAddress,
      });

      updateNegotiationState(p.db, p.negotiationId, 'settled', {
        attestation,
        onchainTxHash: txHash,
      });
      p.log.info({ negotiationId: p.negotiationId, txHash }, 'settlement submitted on-chain');
    } catch (relayerErr) {
      const message = relayerErr instanceof Error ? relayerErr.message : 'relayer error';
      p.log.error({ negotiationId: p.negotiationId, err: message }, 'relayer submission failed — state stays agreement');
      // Keep state as 'agreement' — will be retried manually or by watcher
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    p.log.error({ negotiationId: p.negotiationId, err: message }, 'negotiation crashed');
    updateNegotiationState(p.db, p.negotiationId, 'fail', { failureReason: 'llm_timeout' });
  } finally {
    // Always release the concurrency lock
    _inFlightNegotiations.delete(p.inflightKey);
  }
}
