// GET /status/:negotiationId
// Returns current negotiation state and attestation if available.

import type { FastifyInstance } from 'fastify';
import type { DealId } from '@haggle/shared';
import type { TeeAttestation } from '@haggle/shared';
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

      const attestation: TeeAttestation | undefined =
        row.attestation_json ? (JSON.parse(row.attestation_json) as TeeAttestation) : undefined;

      return reply.code(200).send({
        negotiationId,
        state: row.state,
        attestation,
        onchainTxHash: row.onchain_tx_hash ?? undefined,
        updatedAt: row.updated_at,
      });
    },
  );
}
