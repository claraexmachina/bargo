// ============================================================
// packages/shared/src/types.ts
// Bargo V3 — Sealed-bid marketplace.
// Listings have NO public price. Only reservation prices submitted sealed.
// Service receives ciphertext, decrypts ephemerally in-memory (never logs),
// forwards plaintext into NEAR AI TEE, discards after.
// ============================================================

// --- primitives ---
export type Hex = `0x${string}`;
export type Address = Hex;
export type ListingId = Hex; // bytes32, derived on-chain from (seller, nonce, block.timestamp)
export type OfferId = Hex; // bytes32, derived on-chain from (buyer, listingId, block.timestamp)
export type DealId = Hex; // keccak256(listingId || offerId), bytes32

// --- Karma ---
export type KarmaTier = 0 | 1 | 2 | 3;

// --- Encryption envelope ---
// X25519 ECDH → HKDF-SHA256 → XChaCha20-Poly1305.
// Client seals reservation price + conditions to the service's attested pubkey.
// Service decrypts only in ephemeral request-scope memory, never logged,
// never written to DB as plaintext. DB stores only the envelope JSON.
export interface EncryptedBlob {
  v: 1; // envelope protocol version
  ephPub: Hex; // 32-byte ephemeral X25519 pubkey (sender)
  nonce: Hex; // 24-byte XChaCha20 nonce
  ct: Hex; // ciphertext || poly1305 tag
}

// --- Listing & Offer (PUBLIC fields; no reservation/price leaks) ---
export interface ListingMeta {
  title: string;
  description: string;
  category: 'electronics' | 'fashion' | 'furniture' | 'other';
  images: string[]; // IPFS or data URLs (demo)
}

// Listings show NO price. Only metadata + Karma tier gate.
export interface ListingPublic {
  id: ListingId;
  seller: Address;
  requiredKarmaTier: KarmaTier; // seller-chosen gate (higher for high-value items)
  itemMeta: ListingMeta;
  status: 'open' | 'negotiating' | 'settled' | 'completed' | 'cancelled';
  createdAt: number;
}

// Offers have NO public bid price. The buyer's max is sealed.
export interface OfferPublic {
  id: OfferId;
  listingId: ListingId;
  buyer: Address;
  status: 'pending' | 'matched' | 'failed' | 'withdrawn';
  createdAt: number;
}

// --- Conditions (structured output from NEAR AI LLM inside the TEE) ---
export interface ConditionStruct {
  location: string[];
  timeWindow: {
    days: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>;
    startHour: number; // 0-23 KST
    endHour: number; // 0-23 KST, exclusive
  };
  payment: Array<'cash' | 'card' | 'transfer' | 'crypto'>;
  extras: string[];
}

export interface AgreedConditions {
  location: string;
  meetTimeIso: string; // ISO 8601 with +09:00
  payment: 'cash' | 'card' | 'transfer' | 'crypto';
}

// --- NEAR AI attestation ---
// Nonce = keccak256(dealId || completionId) — binds attestation to a specific inference.
// nearAiAttestationHash = keccak256(canonicalize(full attestation bundle JSON)).
export interface NearAiAttestation {
  dealId: DealId;
  listingId: ListingId;
  offerId: OfferId;
  agreedPrice: string; // wei as decimal string — the only price ever revealed
  agreedConditions: AgreedConditions;
  agreedConditionsHash: Hex; // keccak256(canonical(agreedConditions))
  modelId: string; // "qwen3-30b"
  completionId: string; // NEAR AI chat completion id
  nonce: Hex; // keccak256(dealId || completionId)
  nearAiAttestationHash: Hex; // keccak256 of canonical attestation bundle
  attestationBundleUrl: string; // /attestation/<dealId>
  ts: number;
}

// --- RLN proof ---
export interface RLNProof {
  epoch: number;
  proof: Hex;
  nullifier: Hex;
  signalHash: Hex;
  rlnIdentityCommitment: Hex;
}

// --- Service encryption pubkey ---
// Fetched by clients before sealing reservation data.
// In production this pubkey is attested by the service's TEE (future work);
// for the hackathon the service simply publishes a stable X25519 pubkey.
export interface GetServicePubkeyResponse {
  pubkey: Hex; // 32-byte X25519 pubkey
  issuedAt: number; // unix seconds for rotation tracking
}

// --- REST DTOs ---
// NOTE: no ask/bid prices anywhere. Reservation data is strictly inside EncryptedBlob.
export interface PostListingRequest {
  listingId: ListingId; // on-chain id from seller's registerListing tx
  seller: Address;
  requiredKarmaTier: KarmaTier;
  itemMeta: ListingMeta;
  encMinSell: EncryptedBlob; // sealed plaintextMinSell (wei decimal string)
  encSellerConditions: EncryptedBlob; // sealed natural-language conditions
  onchainTxHash: Hex; // registerListing tx hash for audit
}

export interface PostListingResponse {
  listingId: ListingId;
  onchainTxHash: Hex;
}

export interface PostOfferRequest {
  offerId: OfferId; // on-chain id from buyer's submitOffer tx
  buyer: Address;
  listingId: ListingId;
  encMaxBuy: EncryptedBlob; // sealed plaintextMaxBuy (wei decimal string)
  encBuyerConditions: EncryptedBlob; // sealed natural-language conditions
  rlnProof: RLNProof;
  onchainTxHash: Hex; // submitOffer tx hash for audit
}

export interface PostOfferResponse {
  offerId: OfferId;
  negotiationId: DealId;
  status: 'queued';
}

export type NegotiationState = 'queued' | 'running' | 'agreement' | 'fail' | 'settled';
export type FailureReason = 'no_price_zopa' | 'conditions_incompatible' | 'llm_timeout';

export interface GetStatusResponse {
  negotiationId: DealId;
  state: NegotiationState;
  attestation?: NearAiAttestation;
  failureReason?: FailureReason;
  onchainTxHash?: Hex;
  updatedAt: number;
}

export interface PostAttestationReceiptRequest {
  negotiationId: DealId;
  clientSignature: Hex; // seller or buyer EIP-191 sig acknowledging receipt
}

export interface PostAttestationReceiptResponse {
  ok: true;
}

// --- NEAR AI attestation bundle (raw) — served by GET /attestation/:dealId ---
export interface NearAiAttestationBundle {
  quote: Hex; // Intel TDX quote
  gpu_evidence: Hex; // NVIDIA evidence for NRAS
  signing_key: Hex; // secp256k1 uncompressed pubkey
  signed_response: {
    model: string;
    nonce: Hex;
    completion_id: string;
    timestamp: number;
  };
  signature: Hex; // ECDSA over sha256(canonicalize(signed_response))
}
