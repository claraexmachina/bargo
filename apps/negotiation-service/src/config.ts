import 'dotenv/config';
import { z } from 'zod';

const hexPrivKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'must be 0x-prefixed 32-byte hex');

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),

  // NEAR AI Cloud
  // Empty key is allowed for local dev / CI without a real account; attestation calls will fail.
  // Get a key from https://near.ai/console and add to .env.local as NEAR_AI_API_KEY=<key>.
  NEAR_AI_API_KEY: z.string().default(''),
  NEAR_AI_BASE_URL: z.string().url().default('https://cloud-api.near.ai/v1'),
  NEAR_AI_MODEL: z.string().default('qwen3-30b'),
  NEAR_AI_TIMEOUT_MS: z.coerce.number().int().positive().default(8_000),

  // Chain
  RELAYER_PRIVATE_KEY: hexPrivKey,
  HOODI_RPC_URL: z.string().url().default('https://public.hoodi.rpc.status.network'),
  HAGGLE_ESCROW_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .default('0x0000000000000000000000000000000000000000'),
  KARMA_READER_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .default('0x0000000000000000000000000000000000000000'),
  RLN_VERIFIER_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .default('0x0000000000000000000000000000000000000000'),

  // Storage
  DB_PATH: z.string().default('./data/haggle.db'),
  ATTESTATION_DIR: z.string().default('./data/attestations'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const env = parsed.data;

// Warn loudly if NEAR_AI_API_KEY is empty — attestation will be broken.
if (!env.NEAR_AI_API_KEY) {
  console.warn(
    '[config] NEAR_AI_API_KEY is not set — attestation calls will fail. ' +
    'Get a key from https://near.ai/console and add NEAR_AI_API_KEY=<key> to .env.local',
  );
}

export const config = {
  port: env.PORT,

  nearAi: {
    apiKey: env.NEAR_AI_API_KEY,
    baseURL: env.NEAR_AI_BASE_URL,
    model: env.NEAR_AI_MODEL,
    timeoutMs: env.NEAR_AI_TIMEOUT_MS,
  },

  relayerPrivateKey: env.RELAYER_PRIVATE_KEY as `0x${string}`,
  hoodiRpcUrl: env.HOODI_RPC_URL,
  haggleEscrowAddress: env.HAGGLE_ESCROW_ADDRESS as `0x${string}`,
  karmaReaderAddress: env.KARMA_READER_ADDRESS as `0x${string}`,
  rlnVerifierAddress: env.RLN_VERIFIER_ADDRESS as `0x${string}`,

  dbPath: env.DB_PATH,
  attestationDir: env.ATTESTATION_DIR,
} as const;
