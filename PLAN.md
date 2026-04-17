# Bargo — Architecture & Implementation Plan

**Goal:** Ship a 3-minute end-to-end demo of TEE-mediated P2P negotiation (LLM condition parsing + ZOPA pricing + gasless escrow + Karma gating + RLN rate-limit) on Status Network Hoodi within 48 hours with 4 parallel senior engineers.

**Source of truth:** [`PRD.md`](./PRD.md). This plan never supersedes the PRD; it refines execution. Citations below reference PRD section numbers (e.g., §2.4 = User Stories).

---

## 0. TL;DR for implementers

- **Monorepo**: pnpm workspaces. 4 apps/services + 2 packages + 1 Foundry project.
- **Contracts freeze at T+2h.** Shared TS types freeze at T+3h. Anything after that needs 3/4 consensus.
- **Four leads, four directories.** Nobody edits another lead's files. Integration happens through `packages/shared` (ABI + types + constants) and three frozen wire contracts (REST, TEE RPC, Solidity ABI).
- **Day 0 mock TEE** (§Part 3) is served from `apps/negotiation-service` behind a `MOCK_TEE=1` flag so frontend + contract work is unblocked while TEE lead sets up NEAR AI Cloud.
- **Python TEE runtime.** Rationale in §2.2.
- **No BNB track.** Hackathon ended; all `opBNB` references in PRD are ignored.

---

## 1. Monorepo structure

**Why pnpm workspaces over flat:** TEE is Python (separate toolchain), contracts are Foundry (separate toolchain). Flat would force cross-language scripts into `package.json`. pnpm cleanly isolates the three JS/TS packages while Python and Foundry live side-by-side at top level. Zero ambiguity about where `node_modules` belongs.

```
bargo/
├── PRD.md                        # docs-lead / planner only
├── PLAN.md                       # planner only (this file)
├── README.md                     # docs-lead only
├── pnpm-workspace.yaml           # planner (frozen)
├── package.json                  # planner (frozen; scripts + deps only)
├── biome.json                    # planner (frozen)
├── tsconfig.base.json            # planner (frozen)
├── .env.example                  # planner (frozen; all leads append via PR)
├── .gitignore                    # planner
├── .github/
│   └── workflows/ci.yml          # planner (lint + typecheck + forge test)
│
├── apps/
│   ├── web/                      # frontend-lead (Next.js 14 App Router PWA)
│   │   ├── app/
│   │   │   ├── (marketing)/page.tsx
│   │   │   ├── listings/page.tsx
│   │   │   ├── listings/[id]/page.tsx
│   │   │   ├── listings/new/page.tsx
│   │   │   ├── offers/[id]/page.tsx
│   │   │   ├── deals/[id]/page.tsx          # meetup + QR confirm
│   │   │   └── api/                         # none — all API via negotiation-service
│   │   ├── components/
│   │   │   ├── ListingCard.tsx
│   │   │   ├── ConditionInput.tsx           # natural language textarea
│   │   │   ├── KarmaBadge.tsx
│   │   │   ├── NegotiationStatus.tsx
│   │   │   └── MeetupQR.tsx
│   │   ├── lib/
│   │   │   ├── wagmi.ts
│   │   │   ├── api.ts                       # REST client, types from @bargo/shared
│   │   │   ├── encrypt.ts                   # wraps @bargo/crypto
│   │   │   └── rln.ts                       # wraps Status RLN SDK (or stub)
│   │   ├── public/manifest.webmanifest
│   │   ├── next.config.mjs
│   │   └── package.json
│   │
│   └── negotiation-service/      # service-lead (thin Node.js HTTP)
│       ├── src/
│       │   ├── index.ts                     # Fastify bootstrap
│       │   ├── routes/
│       │   │   ├── listing.ts               # POST /listing
│       │   │   ├── offer.ts                 # POST /offer (RLN verify inline)
│       │   │   ├── status.ts                # GET /status/:id
│       │   │   ├── attestation.ts           # POST /attestation-receipt
│       │   │   └── teePubkey.ts             # GET /tee-pubkey
│       │   ├── db/
│       │   │   ├── schema.sql
│       │   │   └── client.ts                # better-sqlite3 singleton
│       │   ├── tee/
│       │   │   ├── client.ts                # HTTPS call to services/tee
│       │   │   └── mock.ts                  # MOCK_TEE=1 path
│       │   ├── rln/
│       │   │   └── verify.ts                # nullifier dedupe + signal check
│       │   └── chain/
│       │       └── watcher.ts               # log ListingCreated etc. (read-only)
│       ├── test/
│       │   └── routes.test.ts
│       └── package.json
│
├── services/
│   └── tee/                      # tee-lead (Python, runs in NEAR AI Cloud TEE)
│       ├── bargo_tee/
│       │   ├── __init__.py
│       │   ├── server.py                    # FastAPI
│       │   ├── negotiate.py                 # algorithm (§2.8)
│       │   ├── llm.py                       # NEAR AI Cloud client (OpenAI-compat)
│       │   ├── parse_conditions.py          # JSON schema-constrained LLM call
│       │   ├── match_conditions.py          # set-based overlap
│       │   ├── karma_weight.py
│       │   ├── crypto.py                    # X25519 + XChaCha20 decrypt
│       │   ├── attest.py                    # Ed25519 sign of agreement
│       │   └── keys.py                      # enclave keypair load/generate
│       ├── tests/
│       │   ├── test_negotiate.py
│       │   └── fixtures/
│       ├── pyproject.toml                   # uv / hatch
│       ├── Dockerfile                       # for NEAR AI Cloud deploy
│       └── mock_server.js                   # IGNORED — mock lives in negotiation-service
│
├── contracts/                    # contract-lead (Foundry)
│   ├── src/
│   │   ├── BargoEscrow.sol
│   │   ├── KarmaReader.sol
│   │   ├── RLNVerifier.sol
│   │   ├── Listings.sol
│   │   ├── interfaces/
│   │   │   ├── IKarmaReader.sol
│   │   │   └── IRLNVerifier.sol
│   │   └── libs/
│   │       └── AttestationLib.sol           # EIP-712 domain for TEE sig
│   ├── test/
│   │   ├── BargoEscrow.t.sol
│   │   ├── KarmaReader.t.sol
│   │   └── RLNVerifier.t.sol
│   ├── script/
│   │   ├── Deploy.s.sol
│   │   └── Seed.s.sol                       # seed demo listings
│   ├── foundry.toml
│   └── remappings.txt
│
├── packages/
│   ├── shared/                   # planner writes Day 0, frozen after
│   │   ├── src/
│   │   │   ├── index.ts                     # barrel
│   │   │   ├── types.ts                     # ListingMeta, Condition, Attestation...
│   │   │   ├── constants.ts                 # KARMA_THRESHOLDS, ENCLAVE_WHITELIST
│   │   │   ├── schemas.ts                   # Zod at API boundaries only
│   │   │   ├── abi/
│   │   │   │   ├── BargoEscrow.ts          # generated from forge build
│   │   │   │   ├── KarmaReader.ts
│   │   │   │   └── RLNVerifier.ts
│   │   │   └── addresses.ts                 # per-chain deployed addresses
│   │   └── package.json
│   │
│   └── crypto/                   # tee-lead (primary), re-exports consumed by frontend-lead
│       ├── src/
│       │   ├── index.ts
│       │   ├── seal.ts                      # encrypt to TEE pubkey (browser + node)
│       │   ├── open.ts                      # for tests only (TEE uses Python version)
│       │   └── envelope.ts                  # binary layout in §3.5
│       └── package.json
│
└── docs/                         # docs-lead only
    ├── demo-script.md
    ├── deployments.md                        # filled in by contract-lead via PR
    ├── env-reference.md
    └── architecture.svg
```

**Why these boundaries:**
- `apps/*` = user-facing deployables (Vercel + Fly/Render).
- `services/*` = TEE enclave code, lives alone because NEAR AI Cloud deploy != Vercel deploy.
- `contracts/*` = Foundry, orthogonal toolchain.
- `packages/shared` = the contract between every other directory. Freezing it prevents merge hell.
- `packages/crypto` = the *only* place encryption primitives exist. No duplication in web or service.

---

## 2. Tech stack decisions

| Area | Pick | Justification |
|---|---|---|
| **Frontend framework** | Next.js 14 App Router + React Server Components | PWA manifest + SSR listings page with client islands for wallet. RSC by default — only wallet/signing components use `"use client"`. |
| **UI lib** | shadcn/ui + Tailwind | Copy-paste components, no runtime dep, fast customization for 2-phone demo. |
| **Wallet** | wagmi v2 + viem 2.x | Industry default. Status Network Hoodi chain config is a plain `defineChain({ id: 0x1eef21 /* verify */, ... })`. Gasless via Status relayer — use their `eth_sendTransaction` proxy. |
| **Contracts** | Foundry | `forge test` > 10x faster than Hardhat; test-in-Solidity matches hackathon iteration speed; `forge script` deploys to Hoodi in one command. |
| **TEE runtime** | **Python 3.12 + FastAPI** | NEAR AI Cloud exposes OpenAI-compatible SDK, Python client (`openai` pkg) is the reference; Python also gives us `pydantic` for JSON-schema-constrained LLM output (critical for `parse_conditions`). Node.js would need extra ceremony for structured output validation. |
| **LLM client** | `openai` Python SDK pointed at NEAR AI Cloud base URL | Uses structured output (response_format: json_schema). Model: smallest NEAR-hosted Llama-3.1 variant for <10s latency (§2.11 risk). |
| **Encryption** | **X25519 ECDH → HKDF-SHA256 → XChaCha20-Poly1305** via `@noble/ciphers` + `@noble/curves` (TS) and `cryptography` + `pynacl` (Python) | `@noble/*` is audited, zero-dep, browser-compatible (unlike `libsodium-wrappers` WASM blob). XChaCha20 gives a 24-byte random nonce — no nonce-reuse footgun. Alternatives rejected: ECIES with secp256k1 (reuses wallet key, dangerous for key-separation); RSA-OAEP (ciphertext too large for tx gas if we ever commit on-chain); libsodium sealed box (opaque, harder to debug cross-language). |
| **Package manager** | pnpm 9 | Workspace support, fast install, strict peer deps. |
| **Negotiation-service state** | **better-sqlite3, file at `./data/bargo.db`** | Persistent across restarts = safer demo. In-memory would lose state on redeploy during rehearsal. Synchronous API = simple code, no pool. Single-file DB = trivial to `rm` for a clean demo. |
| **Linting** | **Biome** | Single binary for lint + format. Faster than eslint+prettier, no plugin churn. Trade-off: fewer rules than eslint — acceptable for 48h project. Foundry/Solidity linted by `forge fmt`. |
| **RLN** | Status Network RLN SDK via `@waku/rln` if published; **fallback: documented nullifier interface + in-memory Merkle tree stub** in `apps/negotiation-service/src/rln/` | Scope risk (§2.11). Stub is honest: we document "mock RLN" in demo. Interface identical so swap is drop-in. |
| **Testing** | `forge test` for Solidity, `vitest` for TS, `pytest` for Python | Each ecosystem's native, no cross-language test runner. |
| **Deploy targets** | Vercel (`apps/web`), Fly.io or Render (`apps/negotiation-service`), NEAR AI Cloud (`services/tee`), Hoodi testnet (`contracts`) | All free tier or hackathon-credit. |

---

## 3. Shared contracts (SOURCE OF TRUTH)

### 3.1 TypeScript types — `packages/shared/src/types.ts`

```ts
// ============================================================
// packages/shared/src/types.ts
// FROZEN at T+3h. Changes require 3/4 lead consensus.
// ============================================================

// --- primitives ---
export type Hex = `0x${string}`;
export type Address = Hex;
export type ListingId = Hex;      // keccak256(seller || nonce), bytes32
export type OfferId = Hex;        // keccak256(buyer || listingId || nonce), bytes32
export type DealId = Hex;         // keccak256(listingId || offerId), bytes32

// --- Karma ---
export type KarmaTier = 0 | 1 | 2 | 3;
export const KARMA_TIER_NAMES = ['Newcomer', 'Regular', 'Trusted', 'Elite'] as const;

// --- Listing & Offer ---
export interface ListingMeta {
  title: string;
  description: string;
  category: 'electronics' | 'fashion' | 'furniture' | 'other';
  images: string[];               // IPFS or data URLs (demo)
}

export interface ListingPublic {
  id: ListingId;
  seller: Address;
  askPrice: string;               // wei as decimal string (bigint-safe over JSON)
  requiredKarmaTier: KarmaTier;
  itemMeta: ListingMeta;
  status: 'open' | 'negotiating' | 'settled' | 'completed' | 'cancelled';
  createdAt: number;              // unix seconds
  // encrypted fields NOT returned in public GET
}

export interface OfferPublic {
  id: OfferId;
  listingId: ListingId;
  buyer: Address;
  bidPrice: string;               // wei as decimal string
  status: 'pending' | 'matched' | 'failed' | 'withdrawn';
  createdAt: number;
}

// --- Conditions (LLM output schema — FROZEN) ---
export interface ConditionStruct {
  location: string[];             // normalized district names, e.g. ['gangnam', 'songpa']
  timeWindow: {
    days: Array<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'>;
    startHour: number;            // 0-23 local KST
    endHour: number;              // 0-23 local KST, exclusive
  };
  payment: Array<'cash'|'card'|'transfer'|'crypto'>;
  extras: string[];               // free-form tags: 'has-box', 'receipt-required', etc.
}

export interface AgreedConditions {
  location: string;               // single chosen district
  meetTimeIso: string;            // ISO 8601 with KST offset
  payment: 'cash'|'card'|'transfer'|'crypto';
}

// --- Encryption envelope (see §3.5 for byte layout) ---
export interface EncryptedBlob {
  v: 1;                           // version
  ephPub: Hex;                    // 32-byte X25519 ephemeral pubkey, hex
  nonce: Hex;                     // 24-byte XChaCha20 nonce, hex
  ct: Hex;                        // ciphertext + Poly1305 tag, hex
}

// --- TEE attestation ---
export interface TeeAgreement {
  listingId: ListingId;
  offerId: OfferId;
  agreedPrice: string;            // wei as decimal string
  agreedConditions: AgreedConditions;
  modelId: string;                // e.g. "near-ai/llama-3.1-8b-instruct@v1"
  enclaveId: Hex;                 // bytes32 measurement
  ts: number;                     // unix seconds
  nonce: Hex;                     // bytes16, replay protection
}

export interface TeeFailure {
  listingId: ListingId;
  offerId: OfferId;
  reasonHash: Hex;                // bytes32 = keccak256("conditions_incompatible" | "no_price_zopa")
  modelId: string;
  enclaveId: Hex;
  ts: number;
  nonce: Hex;
}

export interface TeeAttestation {
  payload: TeeAgreement | TeeFailure;
  result: 'agreement' | 'fail';
  signature: Hex;                 // Ed25519 over canonical JSON of payload, 64 bytes
  signerPubkey: Hex;              // enclave Ed25519 pubkey, 32 bytes (must be in ENCLAVE_WHITELIST)
}

// --- RLN proof ---
export interface RLNProof {
  epoch: number;                  // unix seconds / EPOCH_DURATION
  proof: Hex;                     // ZK proof bytes; stub = keccak256(signal||epoch||sk)
  nullifier: Hex;                 // bytes32
  signalHash: Hex;                // keccak256 of (listingId || bidPrice || epoch)
  rlnIdentityCommitment: Hex;     // bytes32 Merkle leaf
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
  clientSignature: Hex;           // seller or buyer EIP-191 sig acknowledging receipt
}
export interface PostAttestationReceiptResponse {
  ok: true;
}

export interface GetTeePubkeyResponse {
  pubkey: Hex;                    // 32-byte X25519
  enclaveId: Hex;
  modelId: string;
  whitelistedAt: number;          // unix seconds it was added to ENCLAVE_WHITELIST
}
```

### 3.2 REST API — Negotiation Service ↔ PWA

Base: `https://{NEGOTIATION_SERVICE_URL}`. All JSON. All timestamps unix seconds. All bigints are decimal strings (wei).

| # | Method | Path | Request | Response | Errors |
|---|---|---|---|---|---|
| 1 | POST | `/listing` | `PostListingRequest` | `PostListingResponse` (201) | 400 bad-envelope, 403 karma-tier-mismatch, 500 tee-unreachable |
| 2 | POST | `/offer` | `PostOfferRequest` | `PostOfferResponse` (202) | 400, 403 rln-rejected, 403 karma-gate, 409 throughput-exceeded |
| 3 | GET | `/status/:negotiationId` | — | `GetStatusResponse` | 404 |
| 4 | POST | `/attestation-receipt` | `PostAttestationReceiptRequest` | `PostAttestationReceiptResponse` | 400, 404 |
| 5 | GET | `/tee-pubkey` | — | `GetTeePubkeyResponse` | 503 tee-offline |

Rules:
- `POST /offer` returns `202 Accepted` immediately; client polls `/status` every 1s (max 20s).
- Service validates Zod schema from `@bargo/shared` **at boundary only**. Internal code uses plain types.
- Service never sees plaintext `min_sell`, `max_buy`, or condition text — only encrypted blobs pass through.
- Service performs RLN verify *before* calling TEE.
- Service calls contract `canOfferOn(addr, listingId)` read-only before accepting offer → 403 if false.

### 3.3 TEE RPC — Negotiation Service ↔ TEE

HTTPS + mTLS. Service holds a client cert issued by the TEE's CA (document in `docs/env-reference.md`).

**POST `/negotiate`**

Request (JSON):
```jsonc
{
  "listingId":   "0x...",                // plaintext
  "offerId":     "0x...",                // plaintext
  "nonce":       "0x...",                // bytes16 plaintext, replay protection
  "listingMeta": {                       // plaintext, for LLM context only
    "title": "MacBook M1",
    "category": "electronics"
  },
  "karmaTiers":  { "seller": 3, "buyer": 1 },     // plaintext, from KarmaReader
  "encMinSell":             { "v":1, "ephPub":"0x..", "nonce":"0x..", "ct":"0x.." },
  "encSellerConditions":    { "v":1, ... },
  "encMaxBuy":              { "v":1, ... },
  "encBuyerConditions":     { "v":1, ... }
}
```

Response (JSON) is a `TeeAttestation` (see §3.1).

**GET `/pubkey`** returns `GetTeePubkeyResponse`.

**GET `/health`** returns `{ ok: true, enclaveId, modelId }`.

**Encrypted fields**: the four `enc*` values. **Plaintext fields**: IDs, listing meta, karma tiers, nonce. Rationale: IDs/karma/meta are already on-chain or will be; only reservation prices + natural-language conditions must be sealed.

**Timeout**: service enforces 12s; TEE budgets LLM at 8s + math at <1s. If LLM exceeds, TEE returns `fail` with `reasonHash = keccak256("llm_timeout")`.

### 3.4 Solidity ABI

EIP-712 domain:
```
name:    "Bargo"
version: "1"
chainId: <Hoodi chain id>
verifyingContract: BargoEscrow address
```

#### `BargoEscrow.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

enum DealState { NONE, PENDING, LOCKED, COMPLETED, NOSHOW, REFUNDED }

struct Listing {
    address seller;
    uint256 askPrice;
    uint8   requiredKarmaTier;
    bytes32 itemMetaHash;
    uint64  createdAt;
    bool    active;
}

struct Deal {
    bytes32 listingId;
    bytes32 offerId;
    address seller;
    address buyer;
    uint256 agreedPrice;
    bytes32 attestationHash;      // keccak256 of canonical agreement payload
    bytes32 enclaveId;
    DealState state;
    uint64  createdAt;
    uint64  lockedUntil;          // createdAt + SETTLEMENT_WINDOW
}

interface IBargoEscrow {
    // ─── errors ───
    error KarmaTierBelowRequired(uint8 have, uint8 need);
    error ThroughputExceeded(address who, uint256 current, uint256 max);
    error RLNProofInvalid();
    error ListingNotActive(bytes32 listingId);
    error UnknownEnclave(bytes32 enclaveId);
    error AttestationSigInvalid();
    error DealNotLocked(bytes32 dealId);
    error NotParticipant(address who);
    error AlreadyConfirmed(address who);
    error SettlementWindowOpen(bytes32 dealId);
    error ZeroAddress();
    error ZeroAmount();

    // ─── events (all indexed IDs for cheap filtering) ───
    event ListingCreated(
        bytes32 indexed listingId,
        address indexed seller,
        uint256 askPrice,
        uint8   requiredKarmaTier,
        bytes32 itemMetaHash
    );
    event OfferSubmitted(
        bytes32 indexed listingId,
        bytes32 indexed offerId,
        address indexed buyer,
        uint256 bidPrice,
        bytes32 rlnNullifier
    );
    event NegotiationSettled(
        bytes32 indexed dealId,
        bytes32 indexed listingId,
        bytes32 indexed offerId,
        uint256 agreedPrice,
        bytes32 enclaveId,
        bytes32 attestationHash
    );
    event MeetupConfirmed(bytes32 indexed dealId, address indexed by);
    event NoShowReported(bytes32 indexed dealId, address indexed reporter, address indexed accused);
    event ThroughputExceededEvent(address indexed who, uint256 current);

    // ─── state-changing ───
    function registerListing(
        uint256 askPrice,
        uint8   requiredKarmaTier,
        bytes32 itemMetaHash
    ) external returns (bytes32 listingId);

    function submitOffer(
        bytes32 listingId,
        uint256 bidPrice,
        bytes calldata rlnProof       // opaque, forwarded to RLNVerifier
    ) external returns (bytes32 offerId);

    function settleNegotiation(
        bytes32 listingId,
        bytes32 offerId,
        uint256 agreedPrice,
        bytes32 attestationHash,
        bytes32 enclaveId,
        bytes calldata teeSignature    // Ed25519 sig; verified via precompile or lib
    ) external returns (bytes32 dealId);

    function lockEscrow(bytes32 dealId) external payable;          // buyer locks agreedPrice
    function confirmMeetup(bytes32 dealId) external;                // both parties call → release
    function reportNoShow(bytes32 dealId) external;                 // after lockedUntil
    function refund(bytes32 dealId) external;                       // post-timeout, buyer pulls

    // ─── views ───
    function getListing(bytes32 listingId) external view returns (Listing memory);
    function getDeal(bytes32 dealId) external view returns (Deal memory);
    function activeNegotiations(address who) external view returns (uint256);
}
```

#### `KarmaReader.sol`

```solidity
interface IKarmaReader {
    error UnknownAddress(address who);

    function getTier(address who) external view returns (uint8);            // 0..3
    function getThroughputLimit(uint8 tier) external pure returns (uint256); // [3,10,20,type(uint256).max]
    function canOfferOn(address who, bytes32 listingId) external view returns (bool);
}
```

Implementation strategy: wrap Status Network's Karma SNT balance read. For demo, tier thresholds are constants in `packages/shared/src/constants.ts`:
```ts
export const KARMA_THRESHOLDS_WEI = {
  tier1: 10n * 10n**18n,
  tier2: 100n * 10n**18n,
  tier3: 1000n * 10n**18n,
} as const;
export const THROUGHPUT_LIMITS = [3, 10, 20, 2**31 - 1] as const; // by tier
export const HIGH_VALUE_THRESHOLD_WEI = 500_000n * 10n**18n;      // 500k KRW equiv, demo
```

#### `RLNVerifier.sol`

```solidity
interface IRLNVerifier {
    error NullifierAlreadyUsed(bytes32 nullifier);
    error ProofInvalid();
    error EpochTooOld(uint256 epoch);

    function verify(
        bytes32 signalHash,
        uint256 epoch,
        bytes32 nullifier,
        bytes32 rlnIdentityCommitment,
        bytes calldata proof
    ) external returns (bool);

    function EPOCH_DURATION() external pure returns (uint256); // 300 seconds (5min)
    function MAX_PER_EPOCH() external pure returns (uint256);  // 3
}
```

Stub implementation: maintains `mapping(bytes32 => uint256) nullifierUseCount`, rejects when `> MAX_PER_EPOCH`. Real impl swaps in Status' verifier contract when SDK is ready.

#### Deal state machine

```
NONE
 └── registerListing ─────────────► (Listing.active=true)
 └── submitOffer ─────────────────► (OfferSubmitted event, Deal still NONE)
 └── settleNegotiation ─► PENDING ─► lockEscrow ─► LOCKED
                                                    │
                               ┌────────────────────┼────────────────────┐
                               ▼                    ▼                    ▼
                      both confirmMeetup    reportNoShow (one)    after lockedUntil
                               │                    │                    │
                               ▼                    ▼                    ▼
                          COMPLETED             NOSHOW ──► refund ──► REFUNDED
                          (release to
                           seller)
```

`SETTLEMENT_WINDOW = 24 hours` (constant).

### 3.5 Encryption envelope — exact byte layout

Goal: web and TEE agree on a single canonical format. JSON-wrapped hex for transport, binary for the crypto op.

**Binary layout (decrypted side reconstructs from `EncryptedBlob`):**
```
| offset | size | field              |
|--------|------|--------------------|
|   0    |  32  | ephPub  (X25519)   |
|  32    |  24  | nonce   (XChaCha)  |
|  56    |   N  | ciphertext+tag     |
```
Where `tag` is the trailing 16 bytes (Poly1305) appended by XChaCha20-Poly1305.

**Derivation:**
1. Generate ephemeral X25519 keypair `(eskSender, epkSender)`.
2. `shared = X25519(eskSender, epkTee)` (32 bytes).
3. `key = HKDF-SHA256(shared, salt=epkSender || epkTee, info="bargo-v1", length=32)`.
4. `nonce = randomBytes(24)`.
5. `ct = XChaCha20-Poly1305(key, nonce, plaintext, aad=listingId)`.
   - `aad` is **32 bytes** — just the `listingId`. offerId is NOT part of AEAD; it is
     authenticated at the REST transport boundary (POST /offer binds buyer + listingId + blobs).
     This removes the 64-byte padding ambiguity and eliminates the "web cannot know offerId
     at seal time" problem. Implemented in `packages/crypto/src/seal.ts::buildListingAad`
     (TS) and `services/tee/bargo_tee/crypto.py::build_listing_aad` (Python).
   - **Listing-creation blobs** (`encMinSell`, `encSellerConditions`): the web cannot know
     the real `listingId` before the server responds, so `zeros32` is used as a stable
     placeholder. The real TEE decrypts listing blobs with `zeros32` as AAD (transmitted
     from the service alongside the blobs).

**TS plaintext convention:**
- `encMinSell` / `encMaxBuy`: plaintext is the UTF-8 decimal string of wei (e.g., `"700000000000000000000000"`). No JSON. Keeps blob size tiny.
- `encSellerConditions` / `encBuyerConditions`: plaintext is the raw UTF-8 natural-language string from the user textarea, trimmed, max 2 KB.

**Version byte:** `EncryptedBlob.v = 1` today. If we ever change layout, bump to 2; TEE rejects unknown versions with HTTP 400.

---

## 4. File ownership matrix

Legend: **O** = owner (exclusive write), **R** = read-only reference (must not edit), **—** = no-touch (must not read or depend on; use `packages/shared` instead).

### 4.1 Agent-to-path ownership

| Path glob | Owner | Notes |
|---|---|---|
| `PRD.md`, `PLAN.md` | planner | Frozen. |
| `README.md`, `docs/**` | docs-lead | Other leads submit content via PR comments, docs-lead writes. |
| `pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`, `biome.json`, `.gitignore`, `.github/**` | planner | Frozen after Day 0. Leads submit PRs for new scripts. |
| `.env.example` | planner seeds, **all leads append** | Only append — never rewrite existing keys. |
| `packages/shared/**` | planner (Day 0) → **frozen** | Post-freeze change = 3/4 consensus + bump `v` if envelope/types break wire. |
| `packages/shared/src/abi/**` | contract-lead (generates from `forge build`) | Regenerated automatically; never hand-edited. |
| `packages/shared/src/addresses.ts` | contract-lead | Appends addresses per deploy. |
| `packages/crypto/**` | tee-lead | Frontend-lead imports, never edits. |
| `apps/web/**` | frontend-lead | |
| `apps/negotiation-service/**` | service-lead | |
| `services/tee/**` | tee-lead | |
| `contracts/**` | contract-lead | |

### 4.2 Cross-reference matrix (who may `import from` whom)

| From ↓ / To → | shared | crypto | web | neg-svc | tee | contracts |
|---|---|---|---|---|---|---|
| web | R | R | O | — | — | R (ABI only via shared) |
| neg-svc | R | R | — | O | R (types only, calls via HTTP) | R (ABI only via shared) |
| tee | R (types via codegen) | R (Python equivalent) | — | — | O | — |
| contracts | — | — | — | — | — | O |

### 4.3 Explicit no-touch rules

- **No lead edits `packages/shared` post-freeze** without opening an "ABI change" issue and getting 3/4 sign-off in a single PR.
- Frontend-lead does **not** read `apps/negotiation-service/**` source. They integrate via `@bargo/shared` DTOs only.
- Service-lead does **not** read `services/tee/**` source. They integrate via §3.3 HTTP contract.
- Contract-lead does **not** deploy to mainnet. Hoodi only.
- Tee-lead does **not** import anything from `apps/**`.

---

## 5. Mock/stub strategy for Day 0 unblock

### 5.1 Mock TEE endpoint (in `apps/negotiation-service/src/tee/mock.ts`)

- Activated when env `MOCK_TEE=1`.
- `GET /pubkey` returns a hard-coded X25519 pubkey with its private key committed to `.env.example` under `MOCK_TEE_SK` (clearly labeled "DEMO ONLY").
- `POST /negotiate` mock logic:
  - Decrypt both blobs using mock SK.
  - If `max_buy >= min_sell` → return agreement at midpoint, fixed `agreedConditions = { location:"gangnam", meetTimeIso:"2026-04-20T19:00:00+09:00", payment:"cash" }`.
  - Else → return fail with `reasonHash = keccak256("no_price_zopa")`.
  - Signs with a mock Ed25519 key whose pubkey is in `ENCLAVE_WHITELIST` under `enclaveId = 0xDEADBEEF...`.
- Mock is **removed from whitelist** before production deploy — contract-lead enforces in `Deploy.s.sol`.

Frontend and contract-lead can now write and test end-to-end without waiting for real TEE.

### 5.2 Mock contract stubs

- Contract-lead commits a `Deploy.s.sol` that deploys `BargoEscrow` with a stub `IKarmaReader` and stub `IRLNVerifier` at T+4h.
- `KarmaReader` stub returns tier based on a mapping seeded in `Seed.s.sol` (3 demo wallets: Alice=3, Bob=1, Eve=0).
- `RLNVerifier` stub accepts any proof where `nullifier != 0x00` until T+18h; after that, enforces `MAX_PER_EPOCH`.
- Addresses written to `packages/shared/src/addresses.ts` and `docs/deployments.md`.

### 5.3 Mock RLN proof format

While Status SDK is unconfirmed:
```ts
// frontend lib/rln.ts (stub branch)
const signalHash = keccak256(abiEncode(['bytes32','uint256','uint256'], [listingId, bidPriceWei, epoch]));
const nullifier  = keccak256(abiEncode(['bytes32','bytes32'], [identitySecret, toBytes32(epoch)]));
const proof      = keccak256(abiEncode(['bytes32','bytes32','bytes32'], [signalHash, nullifier, identitySecret]));
```
Interface matches real RLN exactly (proof is opaque `bytes` to the verifier). When Status SDK lands, swap the lib. Contract doesn't change.

---

## 6. Phase gates

| Phase | Wall-clock | Falsifiable exit criterion |
|---|---|---|
| **P0 — Kickoff** | T+0 → T+4h | (a) `pnpm install` green at root; (b) `forge test` green on empty contracts; (c) `services/tee` responds 200 on `/health` (mock or real); (d) `apps/web` renders a hello page from Vercel preview; (e) `packages/shared` types compile and are imported by all three TS packages. |
| **P1 — Parallel build** | T+4h → T+18h | (a) Frontend completes listing + offer forms against **mock TEE**; (b) contract-lead deploys stubs to Hoodi, addresses written to `packages/shared/src/addresses.ts`; (c) TEE `negotiate()` returns valid attestation on a curl fixture **without network LLM** (uses offline fixture); (d) service-lead passes Vitest suite on 5 endpoints with mocked DB and mocked TEE. |
| **P2 — Integration** | T+18h → T+34h | (a) One real end-to-end cycle on Hoodi: listing created → offer submitted → real TEE called (with real NEAR AI LLM) → `settleNegotiation` tx confirmed; (b) Karma tier gating rejects a Tier-0 wallet on a 500k+ listing with `KarmaTierBelowRequired` custom error; (c) Condition-incompatibility demo returns `fail` with hidden reason and frontend shows only "협상 실패"; (d) 5+ transactions visible on Hoodi explorer. |
| **P3 — Demo & bugs** | T+34h → T+48h | (a) 2-phone video recorded (backup); (b) 3-minute live rehearsal completes twice without touching code; (c) `README.md`, `docs/deployments.md`, `.env.example` final; (d) NEAR AI + Status submissions filed. |

A phase ending without its exit criterion met triggers **replanning** (not push-through). §User global rule: "문제가 발생하면 즉시 멈추고 다시 계획을 세우세요."

---

## 7. Top 5 technical risks + mitigations

| # | Risk | Owner | Mitigation |
|---|---|---|---|
| 1 | NEAR AI Cloud LLM latency > 10s kills the 15s demo budget (§US-2). | tee-lead | Pick smallest model at P0. Add 8s hard timeout with `reasonHash=keccak256("llm_timeout")`. Pre-warm with a `/health`-triggered dummy completion. Fallback: cached "golden" fixture for demo (ethics: call this out in demo comment per §2.9). |
| 2 | Status Network gasless relayer misconfigured → buyer pays gas, US-4 fails. | frontend-lead + contract-lead | Follow Scaffold-ETH Status extension exactly; rehearse gasless tx by T+20h; contact @yjkellyjoo by T+8h if blocked. Fallback: document as known-limitation in demo script if not working. |
| 3 | RLN SDK absence blocks US-6. | service-lead | Stub interface from T+0; swap to SDK only if available by T+24h; otherwise ship stub + honest demo disclosure ("RLN mock"). Contract ABI unchanged either way. |
| 4 | TEE attestation signature verification on-chain — Ed25519 is not a native precompile on Hoodi. | contract-lead | Use `@noble/ed25519` derived sig scheme OR switch TEE signer to secp256k1 (native `ecrecover`). **Decision: use secp256k1 in enclave** (TEE lead generates secp256k1 keypair; simpler on-chain verify, identical security). Update §3.1 `signature` comment accordingly — planner will revise post-kickoff vote. |
| 5 | Throughput counter integrity if settlement races offer submission. | contract-lead | `activeNegotiations[who]` incremented in `submitOffer`, decremented in `settleNegotiation`/`cancelOffer`/`confirmMeetup`. Unit test the race: offer → offer → settle → offer (should succeed if under cap). Use `unchecked` only for decrement with `>0` guard. |

---

## 8. Elegance / anti-pattern guardrails

**These are enforced in PR review. A PR failing any of these is rejected.**

- **No custom event bus.** Packages communicate via imported types from `@bargo/shared` and HTTP endpoints in §3. No pub/sub lib, no `mitt`, no EventEmitter bridging packages.
- **No `utils/`, `helpers/`, `common/`, or `lib/misc.ts`.** Every file has a specific domain name. If you can't name it, you don't need it.
- **No commented-out code in PRs.** Delete or don't commit. Git remembers.
- **Solidity:**
  - Custom errors only. `revert CustomError(arg)`. Never `require(x, "string")`.
  - No `using X for *`. Scope to the exact type.
  - No inheritance > 2 levels deep.
  - `forge fmt` on every PR.
- **TypeScript:**
  - No `any`. No `as unknown as`. No `// @ts-ignore`. If you need them, the types are wrong — fix `packages/shared`.
  - Zod schemas **only** at API boundaries (REST request/response, TEE request/response). Internal code passes typed objects directly.
  - No `namespace`, no `enum` (use `const` object + `as const`).
- **React:**
  - Server Components by default. `"use client"` only on components that use hooks, state, or wallet.
  - No `useEffect` for data fetching — use RSC or TanStack Query (already a wagmi dep).
- **Python (TEE):**
  - Pydantic models for every function boundary; no raw dicts.
  - `ruff` + `mypy --strict` on CI.
  - Plaintext secrets never pass through `print`, logger, or exception messages. Add a lint rule that blocks `logger.*(min_sell)` patterns.
- **Encryption:**
  - All encryption flows through `packages/crypto` (TS) or `services/tee/bargo_tee/crypto.py` (Python). No inline `crypto.subtle`, no second copy of X25519 math.
  - The Python and TS envelope code **must match byte-for-byte** (§3.5). A cross-language test fixture in `packages/crypto/test/fixtures/golden-envelope.json` is decryptable by both; CI runs both.
- **Git:**
  - `main` is protected. PRs required.
  - Commit messages: imperative mood, no emoji, no AI signature unless user requests (per global rules).
  - No `.env`, no `tasks/`, no `node_modules` in commits.

---

## 9. Open questions (unresolved — flagged for team decision)

| # | Question | Source | Proposed default | Owner to resolve |
|---|---|---|---|---|
| 1 | **Hoodi chain ID + RPC URL** — PRD says "Hoodi testnet" but does not pin the chainId. | §2.6 | Look up in Status docs at T+0; write into `packages/shared/src/chains.ts`. | contract-lead, T+1h |
| 2 | **TEE signature scheme** — Risk #4 proposes switching Ed25519 → secp256k1 for cheap on-chain verify. | §3.1, §Risk | Adopt secp256k1 unless Hoodi ships an Ed25519 precompile we can use. | contract-lead + tee-lead, T+2h |
| 3 | **NEAR AI Cloud base URL + chosen model ID.** PRD calls out `"near-ai/llama-3.1-..."` as placeholder. | §2.8 | Pin the exact model tag at T+0 and write to `ENCLAVE_WHITELIST` + `modelId` constant. | tee-lead, T+1h |
| 4 | **Karma SNT staking threshold units** — PRD gives no KRW→SNT mapping. `HIGH_VALUE_THRESHOLD_WEI` is a placeholder. | §2.4 US-2, §2.4 US-5 | Use demo-friendly round numbers (tier2 = 100 SNT, high-value = 500k wei-equiv in demo token). | contract-lead, T+4h |
| 5 | **RLN epoch length** — not specified. | §US-6 | 300 seconds. | service-lead, T+4h |
| 6 | **Meetup confirmation mechanism** — QR implies one party scans the other's dynamic code; PRD is light on spec. | §US-4, §2.12 | Buyer's QR encodes `EIP-712 sign(dealId, "confirm")`; seller scans and co-signs on their phone; both sigs submitted in one `confirmMeetup` tx. | frontend-lead + contract-lead, T+18h |
| 7 | **Gasless relayer spec** — Status provides; exact endpoint + caps unknown until T+0. | §US-4 | Follow Scaffold-ETH Status extension docs; capture into `docs/env-reference.md`. | frontend-lead, T+8h |
| 8 | **Seller's role in RLN** — PRD specifies RLN on offers (§US-6); does seller listing creation need RLN too? | §US-6 | Listings limited to 1 per 5min per seller via simple contract nonce check; no RLN for listings (scope). | contract-lead, T+4h |

**Do not resolve by guessing.** Each question has an owner + deadline; blocking questions escalate to full-team 10-minute huddle.

---

## 10. Day-0 kickoff checklist (planner hands this to the team)

- [ ] Confirm all 4 leads read PRD §2.2, §2.4, §2.8 (20 min silent read).
- [ ] Planner walks §3.1–3.5 (30 min). Leads flag any ABI concerns — resolve or escalate to §9.
- [ ] Each lead opens their directory skeleton (empty files matching §1 tree) and commits via first PR.
- [ ] `.env.example` seeded by planner; leads append their own keys.
- [ ] GitHub branch protection on `main`, PR review required.
- [ ] Linear/Notion page linked: PRD + PLAN + deployments.md + env-reference.md.
- [ ] All 8 open questions in §9 assigned with a T+N deadline.
- [ ] Phase P0 exit criteria (§6) posted in team chat.

Once checklist is green, leads split and work in parallel. Next sync: T+4h at P0 gate.

---

*End of PLAN.md — freeze at T+3h unless 3/4 consensus to amend.*
