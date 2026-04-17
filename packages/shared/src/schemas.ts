import { z } from 'zod';

// Hex validator — used at REST API boundaries only.
// Internal code passes typed objects directly (no Zod).
const hexSchema = z.custom<`0x${string}`>(
  (v) => typeof v === 'string' && /^0x[0-9a-fA-F]*$/.test(v),
  { message: 'Expected hex string starting with 0x' },
);

const addressSchema = hexSchema;
const listingIdSchema = hexSchema;
const offerIdSchema = hexSchema;
const dealIdSchema = hexSchema;

const karmaTierSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

const listingMetaSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000),
  category: z.enum(['electronics', 'fashion', 'furniture', 'other']),
  images: z.array(z.string()).max(10),
});

const rlnProofSchema = z.object({
  epoch: z.number().int().positive(),
  proof: hexSchema,
  nullifier: hexSchema,
  signalHash: hexSchema,
  rlnIdentityCommitment: hexSchema,
});

// Encryption envelope — sealed to service pubkey at the API boundary.
const encryptedBlobSchema = z.object({
  v: z.literal(1),
  ephPub: hexSchema,
  nonce: hexSchema,
  ct: hexSchema,
});

const agreedConditionsSchema = z.object({
  location: z.string().min(1).max(200),
  meetTimeIso: z.string().min(1),
  payment: z.enum(['cash', 'card', 'transfer', 'crypto']),
});

// POST /listing — sealed-bid. No public ask price anywhere.
export const postListingRequestSchema = z.object({
  listingId: listingIdSchema,
  seller: addressSchema,
  requiredKarmaTier: karmaTierSchema,
  itemMeta: listingMetaSchema,
  encMinSell: encryptedBlobSchema,
  encSellerConditions: encryptedBlobSchema,
  onchainTxHash: hexSchema,
});
export type PostListingRequestParsed = z.infer<typeof postListingRequestSchema>;

export const postListingResponseSchema = z.object({
  listingId: listingIdSchema,
  onchainTxHash: hexSchema,
});
export type PostListingResponseParsed = z.infer<typeof postListingResponseSchema>;

// POST /offer — sealed-bid. No public bid price.
export const postOfferRequestSchema = z.object({
  offerId: offerIdSchema,
  buyer: addressSchema,
  listingId: listingIdSchema,
  encMaxBuy: encryptedBlobSchema,
  encBuyerConditions: encryptedBlobSchema,
  rlnProof: rlnProofSchema,
  onchainTxHash: hexSchema,
});
export type PostOfferRequestParsed = z.infer<typeof postOfferRequestSchema>;

// GET /service-pubkey — fetched by clients before sealing reservation data.
export const getServicePubkeyResponseSchema = z.object({
  pubkey: hexSchema,
  issuedAt: z.number().int().positive(),
});
export type GetServicePubkeyResponseParsed = z.infer<typeof getServicePubkeyResponseSchema>;

// --- Standing Intents ---
const intentFiltersSchema = z.object({
  category: z.enum(['electronics', 'fashion', 'furniture', 'other']).optional(),
  requiredKarmaTierCeiling: karmaTierSchema.optional(),
});

export const postIntentRequestSchema = z.object({
  buyer: addressSchema,
  encMaxBuy: encryptedBlobSchema,
  encBuyerConditions: encryptedBlobSchema,
  filters: intentFiltersSchema,
  expiresAt: z.number().int().positive(),
});
export type PostIntentRequestParsed = z.infer<typeof postIntentRequestSchema>;

export const postIntentResponseSchema = z.object({
  intentId: hexSchema,
});
export type PostIntentResponseParsed = z.infer<typeof postIntentResponseSchema>;

export const getIntentMatchesResponseSchema = z.object({
  matches: z.array(
    z.object({
      intentId: hexSchema,
      listingId: listingIdSchema,
      seller: addressSchema,
      itemMeta: listingMetaSchema,
      requiredKarmaTier: karmaTierSchema,
      score: z.enum(['match', 'likely', 'uncertain']),
      matchReason: z.string().max(200),
      matchedAt: z.number().int().positive(),
      acknowledged: z.boolean(),
    }),
  ),
});
export type GetIntentMatchesResponseParsed = z.infer<typeof getIntentMatchesResponseSchema>;

export const postOfferResponseSchema = z.object({
  offerId: offerIdSchema,
  negotiationId: dealIdSchema,
  status: z.literal('queued'),
});
export type PostOfferResponseParsed = z.infer<typeof postOfferResponseSchema>;

// NEAR AI attestation (returned inside GET /status and stored on disk)
const nearAiAttestationSchema = z.object({
  dealId: dealIdSchema,
  listingId: listingIdSchema,
  offerId: offerIdSchema,
  agreedPrice: z.string().regex(/^\d+$/),
  agreedConditions: agreedConditionsSchema,
  agreedConditionsHash: hexSchema,
  modelId: z.string().min(1),
  completionId: z.string().min(1),
  nonce: hexSchema,
  nearAiAttestationHash: hexSchema,
  attestationBundleUrl: z.string().min(1),
  ts: z.number().int().positive(),
});

// GET /status/:negotiationId
export const getStatusResponseSchema = z.object({
  negotiationId: dealIdSchema,
  state: z.enum(['queued', 'running', 'agreement', 'fail', 'settled']),
  attestation: nearAiAttestationSchema.optional(),
  failureReason: z.enum(['no_price_zopa', 'conditions_incompatible', 'llm_timeout']).optional(),
  onchainTxHash: hexSchema.optional(),
  updatedAt: z.number().int().positive(),
});
export type GetStatusResponseParsed = z.infer<typeof getStatusResponseSchema>;

// POST /attestation-receipt
export const postAttestationReceiptRequestSchema = z.object({
  negotiationId: dealIdSchema,
  clientSignature: hexSchema,
});
export type PostAttestationReceiptRequestParsed = z.infer<
  typeof postAttestationReceiptRequestSchema
>;

export const postAttestationReceiptResponseSchema = z.object({
  ok: z.literal(true),
});
export type PostAttestationReceiptResponseParsed = z.infer<
  typeof postAttestationReceiptResponseSchema
>;

// GET /attestation/:dealId — raw NEAR AI bundle served verbatim to verifier
export const nearAiAttestationBundleSchema = z.object({
  quote: hexSchema,
  gpu_evidence: hexSchema,
  signing_key: hexSchema,
  signed_response: z.object({
    model: z.string().min(1),
    nonce: hexSchema,
    completion_id: z.string().min(1),
    timestamp: z.number().int().positive(),
  }),
  signature: hexSchema,
});
export type NearAiAttestationBundleParsed = z.infer<typeof nearAiAttestationBundleSchema>;
