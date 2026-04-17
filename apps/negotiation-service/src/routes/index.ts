// Route registration — wires all sub-routers into the Fastify instance.

import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { TeeClient } from '../tee/client.js';
import type { Address } from '@haggle/shared';
import { listingRoutes } from './listing.js';
import { offerRoutes } from './offer.js';
import { statusRoutes } from './status.js';
import { attestationRoutes } from './attestation.js';
import { teePubkeyRoutes } from './teePubkey.js';
import { createChainClient } from '../chain/read.js';

// ChainDeps is used in offer.ts to avoid circular imports
export interface ChainDeps {
  client: ReturnType<typeof createChainClient>;
  karmaReaderAddress: Address;
  haggleEscrowAddress: Address;
}

export async function registerRoutes(
  app: FastifyInstance,
  opts: {
    db: Database.Database;
    tee: TeeClient;
    chain: ChainDeps;
  },
): Promise<void> {
  await app.register(async (sub) => {
    await listingRoutes(sub, { db: opts.db });
    await offerRoutes(sub, { db: opts.db, tee: opts.tee, chain: opts.chain });
    await statusRoutes(sub, { db: opts.db });
    await attestationRoutes(sub, { db: opts.db });
    await teePubkeyRoutes(sub, { tee: opts.tee });
  });
}
