// GET /status/:negotiationId
// Returns current negotiation state, attestation (when agreement/settled), failureReason (when fail).

import type { FastifyInstance } from 'fastify';
import type { DealId, NearAiAttestation } from '@haggle/shared';
import { getNegotiationById } from '../db/client.js';
import type Database from 'better-sqlite3';

export async function statusRoutes(
  app: FastifyInstance,
  opts: { db: Database.Database },
) {
  app.get<{ Params: { negotiationId: string } }>(
    '/status/:negotiationId',
    async (request, reply) => {
      const { negotiationId } = request.params;

      if (!negotiationId || !/^0x[0-9a-fA-F]{64}$/.test(negotiationId)) {
        return reply.code(400).send({
          error: { code: 'bad-request', message: 'negotiationId must be a 32-byte hex string' },
        });
      }

      const row = getNegotiationById(opts.db, negotiationId as DealId);
      if (!row) {
        return reply.code(404).send({
          error: { code: 'not-found', message: 'Negotiation not found' },
        });
      }

      const attestation: NearAiAttestation | undefined =
        row.attestation_json
          ? (JSON.parse(row.attestation_json) as NearAiAttestation)
          : undefined;

      const response: Record<string, unknown> = {
        negotiationId,
        state: row.state,
        updatedAt: row.updated_at,
      };

      if (attestation && (row.state === 'agreement' || row.state === 'settled')) {
        response.attestation = attestation;
      }

      if (row.failure_reason && row.state === 'fail') {
        response.failureReason = row.failure_reason;
      }

      if (row.onchain_tx_hash) {
        response.onchainTxHash = row.onchain_tx_hash;
      }

      return reply.code(200).send(response);
    },
  );
}
