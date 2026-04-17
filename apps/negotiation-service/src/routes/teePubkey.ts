// GET /tee-pubkey
// Returns the TEE's X25519 public key (for client-side encryption).
// Response is cached for 60 seconds to avoid hammering the TEE.

import type { FastifyInstance } from 'fastify';
import type { TeeClient } from '../tee/client.js';
import type { GetTeePubkeyResponse } from '@haggle/shared';

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  data: GetTeePubkeyResponse;
  fetchedAt: number;
}

export async function teePubkeyRoutes(
  app: FastifyInstance,
  opts: { tee: TeeClient },
) {
  let cache: CacheEntry | null = null;

  app.get('/tee-pubkey', async (_request, reply) => {
    const now = Date.now();

    if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
      return reply.code(200).send(cache.data);
    }

    try {
      const data = await opts.tee.getPubkey();
      cache = { data, fetchedAt: now };
      return reply.code(200).send(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'TEE unreachable';
      app.log.error({ err: message }, 'tee-pubkey fetch failed');
      return reply.code(503).send({
        error: { code: 'tee-offline', message: 'TEE is unreachable' },
      });
    }
  });
}
