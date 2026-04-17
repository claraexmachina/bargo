import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { getDb, closeDb } from './db/client.js';
import { createChainClient } from './chain/read.js';
import { startFundsReleasedWatcher } from './chain/watcher.js';
import { registerRoutes } from './routes/index.js';
import { runStartupAttestationCheck } from './nearai/attestation.js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const app = Fastify({
  logger: {
    level: 'info',
    // Redact plaintext reservation values from all log output (PLAN_V2 §4 threat model).
    // Root-level paths catch log.info(body, ...) where body IS the logged object.
    // Wildcard paths catch log.info({ req: body }, ...) at any nesting depth.
    redact: {
      paths: [
        'plaintextMinSell',
        'plaintextMaxBuy',
        'plaintextSellerConditions',
        'plaintextBuyerConditions',
        '*.plaintextMinSell',
        '*.plaintextMaxBuy',
        '*.plaintextSellerConditions',
        '*.plaintextBuyerConditions',
        'req.body.plaintextMinSell',
        'req.body.plaintextMaxBuy',
        'req.body.plaintextSellerConditions',
        'req.body.plaintextBuyerConditions',
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

  // MEDIUM A6: Crash recovery — mark stuck negotiations as failed on startup.
  // Covers negotiations that were 'queued' or 'running' when the process died.
  const stuckTimeout = 120; // seconds
  db.exec(`
    UPDATE negotiations
    SET state = 'fail',
        failure_reason = 'llm_timeout',
        updated_at = unixepoch()
    WHERE state IN ('queued', 'running')
      AND updated_at < (unixepoch() - ${stuckTimeout})
  `);

  await app.register(cors, {
    origin: true, // permissive for hackathon; restrict in prod
  });

  await registerRoutes(app, {
    db,
    chain: {
      client: chainClient,
      karmaReaderAddress: config.karmaReaderAddress,
      bargoEscrowAddress: config.bargoEscrowAddress,
      rpcUrl: config.hoodiRpcUrl,
    },
    nearAi: config.nearAi,
    relayerPrivateKey: config.relayerPrivateKey,
    bargoEscrowAddress: config.bargoEscrowAddress,
    attestationDir: config.attestationDir,
  });

  const address = await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info({ address, model: config.nearAi.model }, 'negotiation-service started');

  // BLOCKER A2: Start FundsReleased watcher so auto-purge trigger fires on deal completion.
  const unwatchFundsReleased = startFundsReleasedWatcher(
    chainClient,
    config.bargoEscrowAddress,
    db,
    app.log,
  );
  app.log.info('FundsReleased watcher started');

  // HIGH A4: Gate startup attestation check behind env flag (default off) to avoid
  // consuming NEAR AI quota on every cold start / CI run.
  if (process.env.NEAR_AI_STARTUP_CHECK === 'true') {
    await runStartupAttestationCheck({
      model: config.nearAi.model,
      apiKey: config.nearAi.apiKey,
      baseURL: config.nearAi.baseURL,
      logger: {
        warn: (obj, msg) => app.log.warn(obj, msg),
        info: (obj, msg) => app.log.info(obj, msg),
      },
    });
  } else {
    app.log.warn('NEAR_AI_STARTUP_CHECK is not set to "true" — skipping startup attestation check. Set NEAR_AI_STARTUP_CHECK=true to enable.');
  }

  // Return cleanup handle for shutdown
  return unwatchFundsReleased;
}

let _unwatchFundsReleased: (() => void) | undefined;

async function shutdown(signal: string) {
  app.log.info({ signal }, 'shutting down');
  if (_unwatchFundsReleased) {
    _unwatchFundsReleased();
    app.log.info('FundsReleased watcher stopped');
  }
  await app.close();
  closeDb();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

bootstrap()
  .then((unwatch) => {
    _unwatchFundsReleased = unwatch;
  })
  .catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
