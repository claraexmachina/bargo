// POST /attestation-receipt
// Called by frontend after the user receives and acknowledges the TEE attestation.
// Verifies EIP-191 signature over keccak256(negotiationId + "ack").
// If onchainTxHash is provided, records it in the negotiation row.

import type { FastifyInstance } from 'fastify';
import { keccak256, toBytes, recoverMessageAddress } from 'viem';
import { postAttestationReceiptRequestSchema } from '@haggle/shared';
import type { DealId } from '@haggle/shared';
import { getNegotiationById, getListingById, getOfferById, updateNegotiationState, bufferToHex } from '../db/client.js';
import type Database from 'better-sqlite3';

export async function attestationRoutes(
  app: FastifyInstance,
  opts: { db: Database.Database },
) {
  app.post('/attestation-receipt', async (request, reply) => {
    const result = postAttestationReceiptRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        error: { code: 'bad-request', message: result.error.issues[0]?.message ?? 'Invalid request body' },
      });
    }

    const { negotiationId, clientSignature } = result.data;

    const row = getNegotiationById(opts.db, negotiationId as DealId);
    if (!row) {
      return reply.code(404).send({
        error: { code: 'not-found', message: 'Negotiation not found' },
      });
    }

    // Verify EIP-191 signature: signer must be the seller or buyer of this negotiation
    const ackMessage = keccak256(toBytes(`${negotiationId}ack`));

    let recoveredAddress: `0x${string}`;
    try {
      recoveredAddress = await recoverMessageAddress({
        message: { raw: ackMessage },
        signature: clientSignature as `0x${string}`,
      });
    } catch {
      return reply.code(400).send({
        error: { code: 'invalid-signature', message: 'Could not recover signer from clientSignature' },
      });
    }

    // Load listing and offer to find valid signers
    const listingId = bufferToHex(row.listing_id);
    const offerId = bufferToHex(row.offer_id);

    const listing = getListingById(opts.db, listingId as `0x${string}`);
    const offer = getOfferById(opts.db, offerId as `0x${string}`);

    if (!listing || !offer) {
      return reply.code(404).send({
        error: { code: 'not-found', message: 'Associated listing or offer not found' },
      });
    }

    const validSigners = [listing.seller.toLowerCase(), offer.buyer.toLowerCase()];
    if (!validSigners.includes(recoveredAddress.toLowerCase())) {
      return reply.code(403).send({
        error: { code: 'unauthorized', message: 'Signature must be from seller or buyer' },
      });
    }

    // Mark as settled — record optional onchain tx hash from request body
    const body = request.body as { onchainTxHash?: string };
    updateNegotiationState(
      opts.db,
      negotiationId as DealId,
      'settled',
      undefined,
      body.onchainTxHash,
    );

    app.log.info({ negotiationId, signer: recoveredAddress }, 'attestation receipt recorded');

    return reply.code(200).send({ ok: true });
  });
}
