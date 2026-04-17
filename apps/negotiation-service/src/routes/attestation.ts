// GET /attestation/:dealId — streams the saved NEAR AI attestation bundle JSON.
// Returns 404 if no bundle exists on disk for this dealId.
//
// POST /attestation-receipt — records acknowledgement from seller or buyer.
// clientSignature verification is skipped for hackathon (just record ack).

import { postAttestationReceiptRequestSchema } from '@bargo/shared';
import type { DealId } from '@bargo/shared';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { getNegotiationById } from '../db/client.js';
import { loadAttestationBundle } from '../nearai/attestation.js';

export async function attestationRoutes(
  app: FastifyInstance,
  opts: { db: Database.Database; attestationDir: string },
) {
  // GET /attestation/:dealId
  app.get<{ Params: { dealId: string } }>('/attestation/:dealId', async (request, reply) => {
    const { dealId } = request.params;

    if (!dealId || !/^0x[0-9a-fA-F]{64}$/.test(dealId)) {
      return reply.code(400).send({
        error: { code: 'bad-request', message: 'dealId must be a 32-byte hex string' },
      });
    }

    const bundle = loadAttestationBundle(opts.attestationDir, dealId as DealId);
    if (!bundle) {
      return reply.code(404).send({
        error: { code: 'not-found', message: 'Attestation bundle not found for this dealId' },
      });
    }

    return reply.code(200).header('Content-Type', 'application/json').send(bundle);
  });

  // POST /attestation-receipt
  app.post('/attestation-receipt', async (request, reply) => {
    const result = postAttestationReceiptRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        error: {
          code: 'bad-request',
          message: result.error.issues[0]?.message ?? 'Invalid request body',
        },
      });
    }

    const { negotiationId } = result.data;

    const row = getNegotiationById(opts.db, negotiationId as DealId);
    if (!row) {
      return reply.code(404).send({
        error: { code: 'not-found', message: 'Negotiation not found' },
      });
    }

    // For hackathon: just record the ack — no EIP-191 signature verification
    app.log.info({ negotiationId }, 'attestation receipt acknowledged');

    return reply.code(200).send({ ok: true });
  });
}
