// GET /service-pubkey
// Returns the service's X25519 public key so clients can seal reservation data.
// Cached for 5 minutes — key is stable for the lifetime of the process.

import type { Hex } from '@bargo/shared';
import type { FastifyInstance } from 'fastify';

export async function servicePubkeyRoutes(
  app: FastifyInstance,
  opts: { servicePubkey: Hex },
): Promise<void> {
  const issuedAt = Math.floor(Date.now() / 1000);

  app.get('/service-pubkey', async (_request, reply) => {
    reply.header('Cache-Control', 'public, max-age=300');
    return reply.send({ pubkey: opts.servicePubkey, issuedAt });
  });
}
