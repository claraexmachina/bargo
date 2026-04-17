// ============================================================
// packages/shared/src/types.ts
// Haggle V2 — NEAR AI Cloud TEE architecture.
// See PLAN_V2.md §3.1 for the full spec. Frozen at Phase 1 start.
// Any change requires A+B+C sign-off + version bump.
// ============================================================

// --- primitives ---
export type Hex = `0x${string}`;
export type Address = Hex;
export type ListingId = Hex; // keccak256(seller || nonce), bytes32
export type OfferId = Hex; // keccak256(buyer || listingId || nonce), bytes32
export type DealId = Hex; // keccak256(listingId || offerId), bytes32

// --- Karma ---
export type KarmaTier = 0 | 1 | 2 | 3;

// --- Listing & Offer (public — no reservation data exposed) ---
export interface ListingMeta {
  title: string;
  description: string;
  category: 'electronics' | 'fashion' | 'furniture' | 'other';
  images: string[]; // IPFS or data URLs (demo)
}

export interface ListingPublic {
  id: ListingId;
  seller: Address;
  askPrice: string; // wei as decimal string (bigint-safe over JSON)
  requiredKarmaTier: KarmaTier;
  itemMeta: ListingMeta;
  status: 'open' | 'negotiating' | 'settled' | 'completed' | 'cancelled';
  createdAt: number;
}

export interface OfferPublic {
  id: OfferId;
  listingId: ListingId;
  buyer: Address;
  bidPrice: string;
  status: 'pending' | 'matched' | 'failed' | 'withdrawn';
  createdAt: number;
}

// --- Conditions (structured output from NEAR AI LLM) ---
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
// Full bundle (quote + gpu_evidence + signing_key + signed_response + signature)
// is served by GET /attestation/:dealId on the negotiation service.
export interface NearAiAttestation {
  dealId: DealId;
  listingId: ListingId;
  offerId: OfferId;
  agreedPrice: string;
  agreedConditions: AgreedConditions;
  modelId: string; // "qwen3-30b" or fallback
  completionId: string; // NEAR AI chat completion id
  nonce: Hex; // keccak256(dealId || completionId)
  nearAiAttestationHash: Hex; // keccak256 of canonical attestation bundle
  attestationBundleUrl: string; // /attestation/<dealId>
  ts: number;
}

// --- RLN proof (unchanged from V1) ---
export interface RLNProof {
  epoch: number;
  proof: Hex;
  nullifier: Hex;
  signalHash: Hex;
  rlnIdentityCommitment: Hex;
}

// --- REST DTOs ---
export interface PostListingRequest {
  seller: Address;
  askPrice: string;
  requiredKarmaTier: KarmaTier;
  itemMeta: ListingMeta;
  plaintextMinSell: string; // wei as decimal
  plaintextSellerConditions: string; // utf-8, max 2KB, trimmed
}

export interface PostListingResponse {
  listingId: ListingId;
  onchainTxHash: Hex | null; // null until relayer broadcasts
}

export interface PostOfferRequest {
  buyer: Address;
  listingId: ListingId;
  bidPrice: string;
  plaintextMaxBuy: string;
  plaintextBuyerConditions: string;
  rlnProof: RLNProof;
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
// Shape confirmed in Phase 0 by Agent B; deviations documented in
// docs/attestation-verification.md.
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
