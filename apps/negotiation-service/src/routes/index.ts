// Route registration — wires all sub-routers into the Fastify instance.

import type { Address } from '@bargo/shared';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import type { createChainClient } from '../chain/read.js';
import { attestationRoutes } from './attestation.js';
import { listingRoutes } from './listing.js';
import { offerRoutes } from './offer.js';
import { statusRoutes } from './status.js';

// ChainDeps is used in offer.ts to avoid circular imports
export interface ChainDeps {
  client: ReturnType<typeof createChainClient>;
  karmaReaderAddress: Address;
  bargoEscrowAddress: Address;
  rpcUrl: string;
}

export interface NearAiConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  timeoutMs: number;
}

export async function registerRoutes(
  app: FastifyInstance,
  opts: {
    db: Database.Database;
    chain: ChainDeps;
    nearAi: NearAiConfig;
    relayerPrivateKey: `0x${string}`;
    bargoEscrowAddress: `0x${string}`;
    attestationDir: string;
  },
): Promise<void> {
  await app.register(async (sub) => {
    await listingRoutes(sub, { db: opts.db });
    await offerRoutes(sub, {
      db: opts.db,
      chain: opts.chain,
      nearAi: opts.nearAi,
      relayerPrivateKey: opts.relayerPrivateKey,
      bargoEscrowAddress: opts.bargoEscrowAddress,
      attestationDir: opts.attestationDir,
    });
    await statusRoutes(sub, { db: opts.db });
    await attestationRoutes(sub, { db: opts.db, attestationDir: opts.attestationDir });
  });
}
