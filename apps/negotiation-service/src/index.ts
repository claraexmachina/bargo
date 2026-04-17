import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { getDb, closeDb } from './db/client.js';
import { createTeeClient } from './tee/client.js';
import { createMockTeeClient } from './tee/mock.js';
import { createChainClient } from './chain/read.js';
import { registerRoutes } from './routes/index.js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const app = Fastify({
  logger: {
    level: 'info',
    // Redact enc* fields and rlnProof.proof from all log output (PLAN §8 guardrails)
    redact: {
      paths: ['*.encMinSell', '*.encMaxBuy', '*.encSellerConditions', '*.encBuyerConditions', '*.rlnProof.proof'],
      censor: '[REDACTED]',
    },
  },
});

async function bootstrap() {
  // Ensure DB directory exists
  mkdirSync(dirname(config.dbPath), { recursive: true });

  const db = getDb(config.dbPath);

  const tee = config.mockTee
    ? createMockTeeClient(config.mockTeeSk!, config.mockTeeSignerSk!)
    : createTeeClient(config.teeUrl!);

  const chainClient = createChainClient(config.hoodiRpcUrl);

  await app.register(cors, {
    origin: true, // permissive for hackathon; restrict in prod
  });

  await registerRoutes(app, {
    db,
    tee,
    chain: {
      client: chainClient,
      karmaReaderAddress: config.karmaReaderAddress,
      haggleEscrowAddress: config.haggleEscrowAddress,
    },
  });

  const address = await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info({ address, mockTee: config.mockTee }, 'negotiation-service started');
}

// Graceful shutdown
async function shutdown(signal: string) {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  closeDb();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
