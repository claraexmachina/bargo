// POST /offer
// Validates RLN proof, checks Karma gate, inserts offer, fires engine negotiation.
// Returns 202 immediately; client polls GET /status/:negotiationId.
//
// offerId:  keccak256(abiEncodePacked(['address','bytes32','uint256'], [buyer, listingId, nonce]))
// dealId:   keccak256(abiEncodePacked(['bytes32','bytes32'], [listingId, offerId]))

import type { FastifyInstance } from 'fastify';
import { keccak256, encodePacked } from 'viem';
import { postOfferRequestSchema, THROUGHPUT_LIMITS } from '@haggle/shared';
import type { KarmaTier, DealId, ListingId, OfferId } from '@haggle/shared';
import {
  insertOffer,
  createNegotiation,
  updateNegotiationState,
  updateNegotiationAttestation,
  nextCounter,
  getListingById,
  bufferToHex,
} from '../db/client.js';
import { verifyRlnProof } from '../rln/verify.js';
import { canOffer, getActiveNegotiations, getTier } from '../chain/read.js';
import { runNegotiation } from '../negotiate/engine.js';
import { submitSettlement } from '../chain/relayer.js';
import type Database from 'better-sqlite3';
import type { ChainDeps } from './index.js';
import type { NearAiConfig } from './index.js';

export async function offerRoutes(
  app: FastifyInstance,
  opts: {
    db: Database.Database;
    chain: ChainDeps;
    nearAi: NearAiConfig;
    relayerPrivateKey: `0x${string}`;
    haggleEscrowAddress: `0x${string}`;
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
      opts.chain.haggleEscrowAddress,
      body.buyer,
    );
    if (active >= limit) {
      app.log.warn({ buyer: body.buyer, active, limit }, 'throughput exceeded');
      return reply.code(409).send({
        error: { code: 'throughput-exceeded', message: `Active negotiations limit reached (${limit} for tier ${buyerTier})` },
      });
    }

    // 5. Generate IDs
    const nonce = nextCounter(opts.db, `offer:${body.buyer}:${body.listingId}`);
    const offerId = keccak256(
      encodePacked(
        ['address', 'bytes32', 'uint256'],
        [body.buyer, body.listingId, BigInt(nonce)],
      ),
    ) as OfferId;
    const negotiationId = keccak256(
      encodePacked(['bytes32', 'bytes32'], [body.listingId, offerId]),
    ) as DealId;

    // 6. Insert offer + create negotiation (state: queued)
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

    // 7. Load seller tier for engine
    const sellerTier = await getTier(
      opts.chain.client,
      opts.chain.karmaReaderAddress,
      listing.seller as `0x${string}`,
    );

    const itemMeta = JSON.parse(listing.item_meta_json) as { title: string };

    // 8. Fire-and-forget negotiation engine
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
      haggleEscrowAddress: opts.haggleEscrowAddress,
      hoodiRpcUrl: opts.chain.rpcUrl,
      log: app.log,
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
  haggleEscrowAddress: `0x${string}`;
  hoodiRpcUrl: string;
  log: FastifyInstance['log'];
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
    const { attestation, bundle } = result;

    updateNegotiationAttestation(p.db, p.negotiationId, {
      agreedConditionsHash: attestation.nearAiAttestationHash, // reuse nonce-bounded hash
      nearAiAttestationHash: attestation.nearAiAttestationHash,
      agreedConditionsJson: JSON.stringify(attestation.agreedConditions),
      modelId: attestation.modelId,
      completionId: attestation.completionId,
      attestationBundlePath: `${p.attestationDir}/${p.negotiationId}.json`,
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
        agreedConditionsHash: attestation.nearAiAttestationHash,
        nearAiAttestationHash: attestation.nearAiAttestationHash,
        relayerPrivateKey: p.relayerPrivateKey,
        rpcUrl: p.hoodiRpcUrl,
        escrowAddress: p.haggleEscrowAddress,
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

    void bundle; // bundle is saved to disk inside engine.ts via saveAttestationBundle
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    p.log.error({ negotiationId: p.negotiationId, err: message }, 'negotiation crashed');
    updateNegotiationState(p.db, p.negotiationId, 'fail', { failureReason: 'llm_timeout' });
  }
}
