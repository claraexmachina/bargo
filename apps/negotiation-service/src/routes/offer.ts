// POST /offer
// Validates RLN proof, checks Karma gate, inserts offer, fires TEE negotiation.
// Returns 202 immediately; client polls GET /status/:negotiationId.
//
// offerId:  keccak256(abiEncodePacked(['address','bytes32','uint256'], [buyer, listingId, nonce]))
// dealId:   keccak256(abiEncodePacked(['bytes32','bytes32'], [listingId, offerId]))

import type { FastifyInstance } from 'fastify';
import { keccak256, encodePacked, toHex } from 'viem';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { postOfferRequestSchema, THROUGHPUT_LIMITS } from '@haggle/shared';
import type { KarmaTier, DealId, ListingId, OfferId } from '@haggle/shared';
import {
  insertOffer,
  createNegotiation,
  updateNegotiationState,
  nextCounter,
  getListingById,
} from '../db/client.js';
import { verifyRlnProof } from '../rln/verify.js';
import { canOffer, getActiveNegotiations, getTier } from '../chain/read.js';
import type { TeeClient } from '../tee/client.js';
import type Database from 'better-sqlite3';
import type { ChainDeps } from './index.js';

export async function offerRoutes(
  app: FastifyInstance,
  opts: { db: Database.Database; tee: TeeClient; chain: ChainDeps },
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

    // 3. Karma gate — check buyer's tier meets listing's requiredKarmaTier
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

    // 4. Throughput check — active negotiations must be under tier limit
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
    );
    const negotiationId = keccak256(
      encodePacked(['bytes32', 'bytes32'], [body.listingId, offerId]),
    );

    // 6. Insert offer + create negotiation (state: queued)
    insertOffer(opts.db, {
      id: offerId,
      listingId: body.listingId,
      buyer: body.buyer,
      bidPrice: body.bidPrice,
      encMaxBuyJson: JSON.stringify(body.encMaxBuy),
      encBuyerConditionsJson: JSON.stringify(body.encBuyerConditions),
      rlnNullifier: body.rlnProof.nullifier,
      rlnEpoch: body.rlnProof.epoch,
    });

    createNegotiation(opts.db, {
      id: negotiationId,
      listingId: body.listingId,
      offerId,
    });

    // 7. Fire-and-forget TEE negotiation
    const nonce16 = toHex(randomBytes(16));
    const itemMeta = JSON.parse(listing.item_meta_json) as { title: string; category: string };
    const sellerTier: KarmaTier = (await getTier(
      opts.chain.client,
      opts.chain.karmaReaderAddress,
      listing.seller as `0x${string}`,
    ));

    void runNegotiation({
      db: opts.db,
      tee: opts.tee,
      negotiationId: negotiationId as DealId,
      listingId: body.listingId as ListingId,
      offerId: offerId as OfferId,
      nonce: nonce16,
      itemMeta,
      karmaTiers: { seller: sellerTier, buyer: buyerTier },
      encMinSell: JSON.parse(listing.enc_min_sell_json),
      encSellerConditions: JSON.parse(listing.enc_seller_conditions_json),
      encMaxBuy: body.encMaxBuy,
      encBuyerConditions: body.encBuyerConditions,
      log: app.log,
    });

    return reply.code(202).send({
      offerId,
      negotiationId,
      status: 'queued',
    });
  });
}

interface RunNegotiationParams {
  db: Database.Database;
  tee: TeeClient;
  negotiationId: DealId;
  listingId: ListingId;
  offerId: OfferId;
  nonce: `0x${string}`;
  itemMeta: { title: string; category: string };
  karmaTiers: { seller: KarmaTier; buyer: KarmaTier };
  encMinSell: import('@haggle/shared').EncryptedBlob;
  encSellerConditions: import('@haggle/shared').EncryptedBlob;
  encMaxBuy: import('@haggle/shared').EncryptedBlob;
  encBuyerConditions: import('@haggle/shared').EncryptedBlob;
  log: FastifyInstance['log'];
}

async function runNegotiation(p: RunNegotiationParams): Promise<void> {
  try {
    updateNegotiationState(p.db, p.negotiationId, 'running');

    const attestation = await p.tee.negotiate({
      listingId: p.listingId,
      offerId: p.offerId,
      nonce: p.nonce,
      listingMeta: p.itemMeta,
      karmaTiers: p.karmaTiers,
      encMinSell: p.encMinSell,
      encSellerConditions: p.encSellerConditions,
      encMaxBuy: p.encMaxBuy,
      encBuyerConditions: p.encBuyerConditions,
    });

    const finalState = attestation.result === 'agreement' ? 'agreement' : 'fail';
    updateNegotiationState(p.db, p.negotiationId, finalState, attestation);
    p.log.info({ negotiationId: p.negotiationId, result: attestation.result }, 'negotiation complete');
  } catch (err) {
    // Do not log enc* fields or full DTO — only negotiationId and error message
    const message = err instanceof Error ? err.message : 'unknown error';
    p.log.error({ negotiationId: p.negotiationId, err: message }, 'negotiation failed');
    updateNegotiationState(p.db, p.negotiationId, 'fail');
  }
}
