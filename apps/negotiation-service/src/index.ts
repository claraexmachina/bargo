import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import cors from '@fastify/cors';
import { x25519 } from '@noble/curves/ed25519';
import Fastify from 'fastify';
import { createChainClient } from './chain/read.js';
import { startFundsReleasedWatcher } from './chain/watcher.js';
import { config } from './config.js';
import { closeDb, getDb } from './db/client.js';
import { startMatchmaker } from './matchmaker.js';
import type { MatchmakerHandle } from './matchmaker.js';
import { runStartupAttestationCheck } from './nearai/attestation.js';
import { registerRoutes } from './routes/index.js';

// Derive service pubkey once at startup from the private key.
// SK never leaves this module — only pubkey is published.
function _skToBytes(hex: `0x${string}`): Uint8Array {
  const raw = hex.slice(2);
  const bytes = new Uint8Array(raw.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
function _bytesToHex(bytes: Uint8Array): `0x${string}` {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return `0x${s}`;
}

const servicePubkey = _bytesToHex(x25519.getPublicKey(_skToBytes(config.serviceDecryptSk)));

const app = Fastify({
  logger: {
    level: 'info',
    // Redact enc blob ciphertexts from log output (already opaque, but kept small).
    // Plaintext reservation fields no longer exist — old redact paths removed.
    redact: {
      paths: [
        'encMinSell.ct',
        'encMaxBuy.ct',
        'encSellerConditions.ct',
        'encBuyerConditions.ct',
        '*.encMinSell.ct',
        '*.encMaxBuy.ct',
        '*.encSellerConditions.ct',
        '*.encBuyerConditions.ct',
        'req.body.encMinSell.ct',
        'req.body.encMaxBuy.ct',
        'req.body.encSellerConditions.ct',
        'req.body.encBuyerConditions.ct',
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

  // Crash recovery — mark stuck negotiations as failed on startup.
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
    serviceDecryptSk: config.serviceDecryptSk,
    servicePubkey,
  });

  const address = await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(
    { address, model: config.nearAi.model, servicePubkey },
    'negotiation-service started',
  );

  const unwatchFundsReleased = startFundsReleasedWatcher(
    chainClient,
    config.bargoEscrowAddress,
    db,
    app.log,
  );
  app.log.info('FundsReleased watcher started');

  const matchmaker = startMatchmaker({
    db,
    publicClient: chainClient,
    escrowAddress: config.bargoEscrowAddress,
    serviceDecryptSk: config.serviceDecryptSk,
    nearAi: config.nearAi,
    log: app.log,
  });

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
    app.log.warn(
      'NEAR_AI_STARTUP_CHECK is not set to "true" — skipping startup attestation check. Set NEAR_AI_STARTUP_CHECK=true to enable.',
    );
  }

  return { unwatchFundsReleased, matchmaker };
}

let _unwatchFundsReleased: (() => void) | undefined;
let _matchmaker: MatchmakerHandle | undefined;

async function shutdown(signal: string) {
  app.log.info({ signal }, 'shutting down');
  if (_matchmaker) {
    await _matchmaker.stop();
  }
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
  .then(({ unwatchFundsReleased, matchmaker }) => {
    _unwatchFundsReleased = unwatchFundsReleased;
    _matchmaker = matchmaker;
  })
  .catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
