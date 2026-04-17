import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { getDb, closeDb } from './db/client.js';
import { createChainClient } from './chain/read.js';
import { registerRoutes } from './routes/index.js';
import { runStartupAttestationCheck } from './nearai/attestation.js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const app = Fastify({
  logger: {
    level: 'info',
    // Redact plaintext reservation values from all log output (PLAN_V2 §4 threat model)
    redact: {
      paths: [
        '*.plaintextMinSell',
        '*.plaintextMaxBuy',
        '*.plaintextSellerConditions',
        '*.plaintextBuyerConditions',
      ],
      censor: '[REDACTED]',
    },
  },
});

async function bootstrap() {
  // Ensure DB and attestation directories exist
  mkdirSync(dirname(config.dbPath), { recursive: true });
  mkdirSync(config.attestationDir, { recursive: true });

  const db = getDb(config.dbPath);
  const chainClient = createChainClient(config.hoodiRpcUrl);

  await app.register(cors, {
    origin: true, // permissive for hackathon; restrict in prod
  });

  await registerRoutes(app, {
    db,
    chain: {
      client: chainClient,
      karmaReaderAddress: config.karmaReaderAddress,
      haggleEscrowAddress: config.haggleEscrowAddress,
      rpcUrl: config.hoodiRpcUrl,
    },
    nearAi: config.nearAi,
    relayerPrivateKey: config.relayerPrivateKey,
    haggleEscrowAddress: config.haggleEscrowAddress,
    attestationDir: config.attestationDir,
  });

  const address = await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info({ address, model: config.nearAi.model }, 'negotiation-service started');

  // Phase-0 acceptance check: verify NEAR AI attestation endpoint shape
  await runStartupAttestationCheck({
    model: config.nearAi.model,
    apiKey: config.nearAi.apiKey,
    baseURL: config.nearAi.baseURL,
    logger: {
      warn: (obj, msg) => app.log.warn(obj, msg),
      info: (obj, msg) => app.log.info(obj, msg),
    },
  });
}

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
