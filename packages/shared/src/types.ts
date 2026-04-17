// ============================================================
// packages/shared/src/types.ts
// FROZEN at T+3h. Changes require 3/4 lead consensus.
// TEE signature scheme: secp256k1 ECDSA over EIP-712 structured data.
// Reason: Hoodi has native ecrecover; no custom curve lib needed on-chain.
// ============================================================

// --- primitives ---
export type Hex = `0x${string}`;
export type Address = Hex;
export type ListingId = Hex; // keccak256(seller || nonce), bytes32
export type OfferId = Hex; // keccak256(buyer || listingId || nonce), bytes32
export type DealId = Hex; // keccak256(listingId || offerId), bytes32

// --- Karma ---
export type KarmaTier = 0 | 1 | 2 | 3;

// --- Listing & Offer ---
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
  createdAt: number; // unix seconds
  // encrypted fields NOT returned in public GET
}

export interface OfferPublic {
  id: OfferId;
  listingId: ListingId;
  buyer: Address;
  bidPrice: string; // wei as decimal string
  status: 'pending' | 'matched' | 'failed' | 'withdrawn';
  createdAt: number;
}

// --- Conditions (LLM output schema — FROZEN) ---
export interface ConditionStruct {
  location: string[]; // normalized district names, e.g. ['gangnam', 'songpa']
  timeWindow: {
    days: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>;
    startHour: number; // 0-23 local KST
    endHour: number; // 0-23 local KST, exclusive
  };
  payment: Array<'cash' | 'card' | 'transfer' | 'crypto'>;
  extras: string[]; // free-form tags: 'has-box', 'receipt-required', etc.
}

export interface AgreedConditions {
  location: string; // single chosen district
  meetTimeIso: string; // ISO 8601 with KST offset
  payment: 'cash' | 'card' | 'transfer' | 'crypto';
}

// --- Encryption envelope (see PLAN §3.5 for byte layout) ---
export interface EncryptedBlob {
  v: 1; // version
  ephPub: Hex; // 32-byte X25519 ephemeral pubkey, hex
  nonce: Hex; // 24-byte XChaCha20 nonce, hex
  ct: Hex; // ciphertext + Poly1305 tag, hex
}

// --- TEE attestation ---
// Signature scheme: secp256k1 ECDSA over EIP-712 structured data.
// signature: 65-byte r||s||v, hex-encoded (recoverable sig for on-chain ecrecover).
// signerAddress: Ethereum address (20 bytes) — must be in ENCLAVE_SIGNERS whitelist.
export interface TeeAgreement {
  listingId: ListingId;
  offerId: OfferId;
  agreedPrice: string; // wei as decimal string
  agreedConditions: AgreedConditions;
  modelId: string; // e.g. "near-ai/llama-3.1-8b-instruct@v1"
  enclaveId: Hex; // bytes32 measurement
  ts: number; // unix seconds
  nonce: Hex; // bytes16, replay protection
}

export interface TeeFailure {
  listingId: ListingId;
  offerId: OfferId;
  reasonHash: Hex; // bytes32 = keccak256("conditions_incompatible" | "no_price_zopa")
  modelId: string;
  enclaveId: Hex;
  ts: number;
  nonce: Hex;
}

export interface TeeAttestation {
  payload: TeeAgreement | TeeFailure;
  result: 'agreement' | 'fail';
  // secp256k1 ECDSA sig: 65 bytes (r||s||v), over EIP-712 hash of payload
  signature: Hex;
  // Ethereum address of enclave signer — must be in ENCLAVE_SIGNERS
  signerAddress: Address;
}

// --- RLN proof ---
export interface RLNProof {
  epoch: number; // unix seconds / RLN_EPOCH_DURATION
  proof: Hex; // ZK proof bytes; stub = keccak256(signal||epoch||sk)
  nullifier: Hex; // bytes32
  signalHash: Hex; // keccak256 of (listingId || bidPrice || epoch)
  rlnIdentityCommitment: Hex; // bytes32 Merkle leaf
}

// --- REST DTOs ---
export interface PostListingRequest {
  seller: Address;
  askPrice: string;
  requiredKarmaTier: KarmaTier;
  itemMeta: ListingMeta;
  encMinSell: EncryptedBlob;
  encSellerConditions: EncryptedBlob;
}

export interface PostListingResponse {
  listingId: ListingId;
  onchainTxHash: Hex;
}

export interface PostOfferRequest {
  buyer: Address;
  listingId: ListingId;
  bidPrice: string;
  encMaxBuy: EncryptedBlob;
  encBuyerConditions: EncryptedBlob;
  rlnProof: RLNProof;
}

export interface PostOfferResponse {
  offerId: OfferId;
  negotiationId: DealId;
  status: 'queued';
}

export interface GetStatusResponse {
  negotiationId: DealId;
  state: 'queued' | 'running' | 'agreement' | 'fail' | 'settled';
  attestation?: TeeAttestation;
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

export interface GetTeePubkeyResponse {
  pubkey: Hex; // 32-byte X25519 encryption pubkey
  enclaveId: Hex;
  modelId: string;
  signerAddress: Address; // Ethereum address for attestation verification
  whitelistedAt: number; // unix seconds it was added to ENCLAVE_SIGNERS
}
