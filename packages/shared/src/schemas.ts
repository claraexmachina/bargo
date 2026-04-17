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

const encryptedBlobSchema = z.object({
  v: z.literal(1),
  ephPub: hexSchema,
  nonce: hexSchema,
  ct: hexSchema,
});

const rlnProofSchema = z.object({
  epoch: z.number().int().positive(),
  proof: hexSchema,
  nullifier: hexSchema,
  signalHash: hexSchema,
  rlnIdentityCommitment: hexSchema,
});

// POST /listing
export const postListingRequestSchema = z.object({
  seller: addressSchema,
  askPrice: z.string().regex(/^\d+$/, 'askPrice must be a decimal wei string'),
  requiredKarmaTier: karmaTierSchema,
  itemMeta: listingMetaSchema,
  encMinSell: encryptedBlobSchema,
  encSellerConditions: encryptedBlobSchema,
});
export type PostListingRequestParsed = z.infer<typeof postListingRequestSchema>;

export const postListingResponseSchema = z.object({
  listingId: listingIdSchema,
  onchainTxHash: hexSchema,
});
export type PostListingResponseParsed = z.infer<typeof postListingResponseSchema>;

// POST /offer
export const postOfferRequestSchema = z.object({
  buyer: addressSchema,
  listingId: listingIdSchema,
  bidPrice: z.string().regex(/^\d+$/, 'bidPrice must be a decimal wei string'),
  encMaxBuy: encryptedBlobSchema,
  encBuyerConditions: encryptedBlobSchema,
  rlnProof: rlnProofSchema,
});
export type PostOfferRequestParsed = z.infer<typeof postOfferRequestSchema>;

export const postOfferResponseSchema = z.object({
  offerId: offerIdSchema,
  negotiationId: dealIdSchema,
  status: z.literal('queued'),
});
export type PostOfferResponseParsed = z.infer<typeof postOfferResponseSchema>;

// GET /status/:negotiationId
export const getStatusResponseSchema = z.object({
  negotiationId: dealIdSchema,
  state: z.enum(['queued', 'running', 'agreement', 'fail', 'settled']),
  attestation: z
    .object({
      payload: z.unknown(), // typed consumers use TeeAttestation from types.ts
      result: z.enum(['agreement', 'fail']),
      signature: hexSchema,
      signerAddress: addressSchema,
    })
    .optional(),
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

// GET /tee-pubkey
export const getTeePubkeyResponseSchema = z.object({
  pubkey: hexSchema,
  enclaveId: hexSchema,
  modelId: z.string().min(1),
  signerAddress: addressSchema,
  whitelistedAt: z.number().int().positive(),
});
export type GetTeePubkeyResponseParsed = z.infer<typeof getTeePubkeyResponseSchema>;
