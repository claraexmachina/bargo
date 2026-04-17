import 'dotenv/config';
import { z } from 'zod';

const hexPrivKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'must be 0x-prefixed 32-byte hex');

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),

  // TEE
  TEE_URL: z.string().url().optional(),
  MOCK_TEE: z
    .string()
    .optional()
    .transform((v) => v === '1'),
  MOCK_TEE_SK: hexPrivKey.optional(),
  MOCK_TEE_SIGNER_SK: hexPrivKey.optional(),

  // Chain
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

  // DB
  DB_PATH: z.string().default('./data/haggle.db'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const env = parsed.data;

// Additional cross-field validation
if (!env.MOCK_TEE && !env.TEE_URL) {
  throw new Error('TEE_URL is required when MOCK_TEE is not set');
}

if (env.MOCK_TEE && (!env.MOCK_TEE_SK || !env.MOCK_TEE_SIGNER_SK)) {
  throw new Error('MOCK_TEE_SK and MOCK_TEE_SIGNER_SK are required when MOCK_TEE=1');
}

export const config = {
  port: env.PORT,
  teeUrl: env.TEE_URL,
  mockTee: env.MOCK_TEE,
  mockTeeSk: env.MOCK_TEE_SK as `0x${string}` | undefined,
  mockTeeSignerSk: env.MOCK_TEE_SIGNER_SK as `0x${string}` | undefined,
  hoodiRpcUrl: env.HOODI_RPC_URL,
  haggleEscrowAddress: env.HAGGLE_ESCROW_ADDRESS as `0x${string}`,
  karmaReaderAddress: env.KARMA_READER_ADDRESS as `0x${string}`,
  rlnVerifierAddress: env.RLN_VERIFIER_ADDRESS as `0x${string}`,
  dbPath: env.DB_PATH,
} as const;
