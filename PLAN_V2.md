# Bargo V2 — Architecture & Implementation Plan

**Goal:** Replace the fake self-hosted Python TEE with a direct integration to **NEAR AI Cloud** (Intel TDX + NVIDIA GPU TEE) so judges can verify attestation end-to-end, while simplifying the on-chain settlement path to a single relayer-authorized call that records the NEAR AI attestation hash.

**Supersedes:** `/Users/claraexmachina/bargo/PLAN.md` (v1). Cross-references to PRD remain valid.
**Source of truth for requirements:** `/Users/claraexmachina/bargo/PRD.md` (§2.4 user stories, §2.12 demo scenario, §2.13 submissions). PRD §2.6–2.9 are **architecturally stale**; this document is the new source for architecture, crypto, and trust model. PRD text will be updated in Phase 1 by Agent D.

---

## 0. One-page summary

### Why V2

V1 shipped a Python FastAPI server called "the TEE." It runs on a developer laptop, holds a secp256k1 key, signs EIP-712 attestations, and requires the contract to whitelist its address. **There is no Intel TDX quote, no NVIDIA GPU evidence, and no verifiable measurement.** For the NEAR AI Cloud track's Innovation (30%) and Technical Excellence (20%) criteria — both explicitly rewarding *"novel use of TEE-based privacy"* and *"proper use of attestation"* — this is not scorable.

V2 makes **NEAR AI Cloud** (the real TEE) our trust anchor. Our service becomes a trusted-but-auditable orchestrator: it brokers plaintext between the two users, calls NEAR AI for inference, fetches NEAR AI's attestation, submits the attestation hash on-chain, and purges reservation data on settlement. The ability for any judge to verify the NEAR AI attestation (GPU evidence + TDX quote + signed response nonce) becomes the demo's centerpiece.

### What changed vs V1

| Dimension | V1 | V2 |
|---|---|---|
| TEE | Self-hosted Python FastAPI (fake) | NEAR AI Cloud `cloud-api.near.ai/v1` (real Intel TDX + NVIDIA GPU TEE) |
| Attestation | secp256k1 signature by our key | `GET /v1/attestation/report` — TDX quote + GPU evidence + ECDSA-signed response |
| Trust anchor | Our whitelisted signer address | NEAR AI TEE measurement (verifiable off-chain) |
| Crypto on wire | Client-side X25519 + XChaCha20 to TEE pubkey | **None.** Plaintext over HTTPS to our service. Operator is the trusted broker. |
| On-chain verify | `ecrecover` + `enclaveSigner[]` whitelist | `onlyAttestationRelayer` modifier + `nearAiAttestationHash` stored |
| LLM model | "TBD small Llama" | `qwen3-30b` (JSON-schema output); fallback `deepseek-ai/DeepSeek-V3.1` |
| Verifier | None | `scripts/verify-attestation.mjs` (Node + viem) for judges |
| DB privacy | encrypted-at-rest blobs forever | plaintext columns, **auto-purged on `Deal.state == COMPLETED`** |

### New threat model (one paragraph)

**NEAR AI (LLM provider) is untrusted** — defended by fetching + verifying NEAR AI's own TDX+GPU attestation on every inference, with a nonce bound to `keccak256(dealId ‖ completion_id)`. **Our service operator is a trusted broker** — it sees plaintext reservation prices during the 15-second negotiation window; it auto-purges `plaintext_reservation` and `plaintext_conditions` DB columns when the deal state reaches `COMPLETED`; pre-settlement DB breach is the acknowledged residual risk. **Counterparties (buyer ↔ seller) are untrusted to each other** — defended by the service never returning the other party's floor/ceiling or raw condition text in any API response; each side learns only the final agreed price + merged conditions. **Chain replay / stale attestation** — defended by the nonce binding `dealId` to the exact NEAR AI `chat_completion_id` and storing `nearAiAttestationHash` as an indexed event topic.

### New demo pitch (2–3 sentences)

> *"Our negotiator runs on NEAR AI's Intel TDX + NVIDIA GPU TEE — not a server we control. When you ask 'how do I know their LLM didn't leak my price to the seller?', you download our verifier script, pull the attestation hash off-chain, re-check the TDX quote against Intel's PCS and the GPU evidence against NVIDIA NRAS. The only thing you trust us for is not to peek at plaintext before settlement — and our DB purges it the moment the deal completes."*

### Summary: Deleted / Added / Modified

| Deleted | Added | Modified |
|---|---|---|
| `/Users/claraexmachina/bargo/services/tee/` (whole tree) | `/Users/claraexmachina/bargo/apps/negotiation-service/src/nearai/client.ts` | `/Users/claraexmachina/bargo/contracts/src/BargoEscrow.sol` — remove signer whitelist, add `attestationRelayer`, add `nearAiAttestationHash` event topic |
| `/Users/claraexmachina/bargo/packages/crypto/` (whole tree) | `/Users/claraexmachina/bargo/apps/negotiation-service/src/nearai/attestation.ts` | `/Users/claraexmachina/bargo/contracts/test/BargoEscrow.t.sol` — rewrite to use relayer; remove EIP-712 sig cases |
| `/Users/claraexmachina/bargo/contracts/src/libs/AttestationLib.sol` | `/Users/claraexmachina/bargo/apps/negotiation-service/src/negotiate/engine.ts` | `/Users/claraexmachina/bargo/apps/negotiation-service/src/db/schema.sql` — add plaintext columns + purge trigger |
| `/Users/claraexmachina/bargo/contracts/test/AttestationLib.t.sol` | `/Users/claraexmachina/bargo/apps/negotiation-service/src/negotiate/conditions.ts` | `/Users/claraexmachina/bargo/apps/negotiation-service/src/routes/listing.ts` — accept plaintext |
| `/Users/claraexmachina/bargo/apps/negotiation-service/src/tee/mock.ts` | `/Users/claraexmachina/bargo/apps/negotiation-service/src/negotiate/karmaWeight.ts` | `/Users/claraexmachina/bargo/apps/negotiation-service/src/routes/offer.ts` — accept plaintext, call engine directly |
| `/Users/claraexmachina/bargo/apps/negotiation-service/src/tee/client.ts` | `/Users/claraexmachina/bargo/apps/negotiation-service/src/chain/relayer.ts` (writes `settleNegotiation`) | `/Users/claraexmachina/bargo/apps/negotiation-service/src/routes/status.ts` — include `nearAiAttestationHash` + `modelId` in response |
| `/Users/claraexmachina/bargo/apps/web/lib/encrypt.ts` | `/Users/claraexmachina/bargo/scripts/verify-attestation.mjs` | `/Users/claraexmachina/bargo/packages/shared/src/types.ts` — replace `TeeAttestation` with `NearAiAttestation` shape |
| `/Users/claraexmachina/bargo/apps/negotiation-service/test/mock-tee.test.ts` | `/Users/claraexmachina/bargo/apps/negotiation-service/test/engine.test.ts` | `/Users/claraexmachina/bargo/packages/shared/src/schemas.ts` — drop `EncryptedBlob`, `RLNProof` stays |
| `/Users/claraexmachina/bargo/apps/web/lib/rln.ts` (stays — RLN is Status track) | `/Users/claraexmachina/bargo/apps/web/components/AttestationViewer.tsx` | `/Users/claraexmachina/bargo/apps/web/app/listings/new/page.tsx` — remove seal step |
| `/Users/claraexmachina/bargo/packages/shared/src/abi/AttestationLib.ts` | `/Users/claraexmachina/bargo/docs/threat-model.md` | `/Users/claraexmachina/bargo/apps/web/app/offers/new/[listingId]/page.tsx` — remove seal step |
| `/Users/claraexmachina/bargo/scripts/qa-seal.mjs` | `/Users/claraexmachina/bargo/docs/attestation-verification.md` | `/Users/claraexmachina/bargo/README.md` — new demo path + verifier instructions |
| | | `/Users/claraexmachina/bargo/PRD.md` — rewrite §2.6–2.9 |
| | | `/Users/claraexmachina/bargo/.env.example` — add `NEAR_AI_API_KEY`, `RELAYER_PRIVATE_KEY`; remove `TEE_*`, `MOCK_TEE`, envelope keys |

---

## 1. Directory tree (final state)

```
bargo/
├── PRD.md                             # Agent D rewrites §2.6–2.9
├── PLAN.md                            # archived; points to PLAN_V2.md
├── PLAN_V2.md                         # THIS FILE
├── README.md                          # Agent D rewrites
├── pnpm-workspace.yaml                # unchanged
├── package.json                       # unchanged
├── biome.json                         # unchanged
├── tsconfig.base.json                 # unchanged
├── .env.example                       # Agent D edits
├── .github/workflows/ci.yml           # Agent D edits: drop pytest step
│
├── apps/
│   ├── web/                           # Agent C
│   │   ├── app/
│   │   │   ├── page.tsx               # unchanged
│   │   │   ├── listings/page.tsx      # unchanged
│   │   │   ├── listings/[id]/page.tsx # unchanged
│   │   │   ├── listings/new/page.tsx  # MODIFIED: remove seal, send plaintext
│   │   │   ├── offers/new/[listingId]/page.tsx # MODIFIED: remove seal
│   │   │   └── deals/[id]/page.tsx    # MODIFIED: render AttestationViewer
│   │   ├── components/
│   │   │   ├── AttestationViewer.tsx  # NEW: shows modelId, attestationHash, "verify" link
│   │   │   └── (existing components unchanged)
│   │   └── lib/
│   │       ├── api.ts                 # MODIFIED: plaintext DTOs
│   │       ├── wagmi.ts               # unchanged
│   │       ├── rln.ts                 # unchanged (RLN stays)
│   │       ├── format.ts              # unchanged
│   │       └── utils.ts               # unchanged
│   │       # encrypt.ts DELETED
│   │
│   └── negotiation-service/           # Agent B
│       ├── src/
│       │   ├── index.ts                      # MODIFIED: drop TeeClient bootstrap
│       │   ├── config.ts                     # MODIFIED: add NEAR_AI_API_KEY etc.
│       │   ├── routes/
│       │   │   ├── index.ts                  # MODIFIED
│       │   │   ├── listing.ts                # MODIFIED: plaintext
│       │   │   ├── offer.ts                  # MODIFIED: plaintext, call engine
│       │   │   ├── status.ts                 # MODIFIED: return attestationHash
│       │   │   ├── attestation.ts            # MODIFIED: trim
│       │   │   └── teePubkey.ts              # DELETED (entire file)
│       │   ├── nearai/                       # NEW dir
│       │   │   ├── client.ts                 # OpenAI SDK wrapper → cloud-api.near.ai/v1
│       │   │   └── attestation.ts            # GET /v1/attestation/report + hash compute
│       │   ├── negotiate/                    # NEW dir
│       │   │   ├── engine.ts                 # orchestrates: parse → match → price → attest
│       │   │   ├── conditions.ts             # LLM prompts + JSON schema
│       │   │   └── karmaWeight.ts            # port from services/tee/bargo_tee/karma_weight.py
│       │   ├── chain/
│       │   │   ├── read.ts                   # unchanged
│       │   │   ├── watcher.ts                # unchanged
│       │   │   └── relayer.ts                # NEW: signs + sends settleNegotiation tx
│       │   ├── db/
│       │   │   ├── client.ts                 # MODIFIED: new columns + purge trigger
│       │   │   └── schema.sql                # MODIFIED
│       │   └── rln/verify.ts                 # unchanged
│       │   # tee/ DELETED (whole dir)
│       └── test/
│           ├── routes.test.ts                # MODIFIED: plaintext DTOs
│           ├── rln.test.ts                   # unchanged
│           ├── engine.test.ts                # NEW
│           └── attestation.test.ts           # NEW (fixture-based)
│           # mock-tee.test.ts DELETED
│
├── contracts/                          # Agent A
│   ├── src/
│   │   ├── BargoEscrow.sol                  # MODIFIED: relayer model
│   │   ├── KarmaReader.sol                   # unchanged
│   │   ├── RLNVerifier.sol                   # unchanged
│   │   └── interfaces/                       # unchanged
│   │   # libs/AttestationLib.sol DELETED
│   ├── test/
│   │   ├── BargoEscrow.t.sol                # MODIFIED
│   │   ├── KarmaReader.t.sol                 # unchanged
│   │   └── RLNVerifier.t.sol                 # unchanged
│   │   # AttestationLib.t.sol DELETED
│   └── script/
│       ├── Deploy.s.sol                      # MODIFIED: no signer whitelist; set relayer
│       └── Seed.s.sol                        # unchanged
│
├── packages/
│   └── shared/                          # Agent B writes types; others import
│       ├── src/
│       │   ├── index.ts                      # MODIFIED: drop crypto exports
│       │   ├── types.ts                      # MODIFIED: NearAiAttestation
│       │   ├── schemas.ts                    # MODIFIED
│       │   ├── constants.ts                  # unchanged
│       │   ├── chains.ts                     # unchanged
│       │   ├── addresses.ts                  # unchanged
│       │   └── abi/                          # regen from forge build
│       └── package.json
│   # crypto/ DELETED entirely
│
├── scripts/
│   ├── package.json                          # MODIFIED: add viem, node-fetch
│   ├── qa-scenarios.mjs                      # MODIFIED: plaintext DTOs
│   ├── qa-web-bug-repro.mjs                  # MODIFIED
│   ├── verify-attestation.mjs                # NEW (Agent D)
│   └── qa-seal.mjs                           # DELETED
│
├── docs/
│   ├── deployments.md                        # MODIFIED: add relayer address
│   ├── ux-review.md                          # unchanged
│   ├── qa-report.md                          # unchanged (will be re-run post-refactor)
│   ├── threat-model.md                       # NEW
│   └── attestation-verification.md           # NEW
│
└── services/                                 # DELETED ENTIRELY (services/tee gone)
```

---

## 2. Data flow diagrams

### 2.1 Listing creation

```
┌──────────┐   HTTPS POST /listing            ┌──────────────────────┐
│  Seller  │  { seller, askPrice, itemMeta,   │  Negotiation Service │
│   PWA    │  → requiredKarmaTier,            │  (Fastify)           │
│          │    plaintextMinSell,             │                      │
│          │    plaintextSellerConditions }   │  1. zod validate     │
└──────────┘                                  │  2. INSERT listings  │
                                              │     with plaintext   │
                                              │     columns          │
                                              │  3. call             │
                                              │     BargoEscrow     │
                                              │     .registerListing │
                                              │     via relayer      │
                                              │     (gasless relay)  │
                                              └──────────┬───────────┘
                                                         │
                                              ┌──────────▼───────────┐
                                              │ Status Network Hoodi │
                                              │ emit ListingCreated  │
                                              └──────────────────────┘
```

Notes:
- No encryption step on seller side.
- `plaintextMinSell` and `plaintextSellerConditions` sit in DB as TEXT columns until `Deal.state == COMPLETED` (see §2.3 purge).
- `registerListing` stays on-chain; content hash (`itemMetaHash`) is public; seller Karma tier required for listing is public.

### 2.2 Offer + negotiation

```
┌──────────┐  POST /offer                        ┌──────────────────────────────┐
│  Buyer   │  { buyer, listingId, bidPrice,      │  Negotiation Service         │
│   PWA    │    plaintextMaxBuy,                 │                              │
│          │    plaintextBuyerConditions,        │  1. verify RLN proof         │
│          │    rlnProof }                       │  2. canOffer() on-chain      │
└──────────┘                                     │  3. throughput on-chain      │
                                                 │  4. INSERT offer (plaintext) │
                                                 │  5. fire engine.run()        │
                                                 └────────────┬─────────────────┘
                                                              │ in-process
                                                 ┌────────────▼─────────────────┐
                                                 │  negotiate/engine.ts         │
                                                 │                              │
                                                 │  A. build nonce =            │
                                                 │     keccak256(dealId ‖ 0)    │
                                                 │     (pre-completion; updated │
                                                 │     after step C)            │
                                                 │  B. ZOPA check (plaintext)   │
                                                 │  C. call NEAR AI             │
                                                 │     /v1/chat/completions     │
                                                 │     with response_format     │
                                                 │     json_schema              │
                                                 │  D. capture completion_id    │
                                                 │  E. realNonce =              │
                                                 │     keccak256(dealId ‖       │
                                                 │     completion_id)           │
                                                 │  F. GET /v1/attestation/     │
                                                 │     report?nonce=realNonce   │
                                                 │  G. attestationHash =        │
                                                 │     keccak256(canonical(     │
                                                 │     attestationJson))        │
                                                 │  H. match conditions,        │
                                                 │     compute Karma-weighted   │
                                                 │     price                    │
                                                 │  I. persist attestation      │
                                                 │     blob to disk             │
                                                 │     ./data/attestations/     │
                                                 │       <dealId>.json          │
                                                 │  J. enqueue relayer tx       │
                                                 └────────────┬─────────────────┘
                                                              │
                                                 ┌────────────▼─────────────────┐
                                                 │  chain/relayer.ts            │
                                                 │  settleNegotiation(          │
                                                 │    listingId, offerId,       │
                                                 │    agreedPrice,              │
                                                 │    agreedConditionsHash,     │
                                                 │    nearAiAttestationHash)    │
                                                 └────────────┬─────────────────┘
                                                              │
                                                 ┌────────────▼─────────────────┐
                                                 │  BargoEscrow                │
                                                 │  emit NegotiationSettled     │
                                                 │    (indexed dealId, listing, │
                                                 │     offer, indexed           │
                                                 │     nearAiAttestationHash)   │
                                                 └──────────────────────────────┘
```

### 2.3 Settlement + auto-purge

On `Deal.state == COMPLETED` (both parties confirmed meetup, funds released):

1. `chain/watcher.ts` observes `FundsReleased` event (already present in contract).
2. Handler runs: `UPDATE listings SET plaintext_min_sell=NULL, plaintext_seller_conditions=NULL WHERE id = deal.listing_id;` and same for offers.
3. SQLite trigger is a safety net: defined in `schema.sql`, fires when `negotiations.state` is updated to `'completed'`.
4. Kept forever: `attestation_hash`, `agreed_price`, `agreed_conditions_hash`, `settled_at`, `near_ai_model_id`, `attestation_blob_path`.

### 2.4 Meetup / no-show (unchanged from V1)

Identical to current `BargoEscrow` flow: `lockEscrow` → two `confirmMeetup` calls → `FundsReleased`, or `reportNoShow` after `lockedUntil` → `refund`.

### 2.5 Attestation verification by judge (off-chain)

```
┌───────────┐  node scripts/verify-attestation.mjs --dealId 0x...
│  Judge    │  (needs only: HOODI_RPC, NVIDIA_NRAS_URL)
│  laptop   │
└─────┬─────┘
      │
      ▼
┌──────────────────────────────────────────────────────┐
│ 1. viem getContractEvents(NegotiationSettled,        │
│    filter: dealId)                                   │
│    → read indexed topic nearAiAttestationHash        │
│ 2. fetch attestation JSON from                       │
│    https://<our-service>/attestation/<dealId>        │
│ 3. keccak256(canonical(json)) == onchainHash? ─► OK  │
│ 4. submit GPU evidence to NVIDIA NRAS                │
│    POST https://nras.attestation.nvidia.com/v3/...   │
│    → parse verdict                                   │
│ 5. parse Intel TDX quote via @phala/dcap-qvl-web     │
│    or spawn `dcap-qvl verify --quote ...`            │
│    → validate measurement against pinned MR_TD       │
│ 6. verify signed_response: ECDSA(signing_key,        │
│    sha256(model ‖ nonce ‖ completion_id)) == sig     │
│ 7. recompute expectedNonce =                         │
│    keccak256(dealId ‖ completion_id)                 │
│    → must equal nonce in attestation                 │
│ 8. Output: PASS / FAIL with structured reasons       │
└──────────────────────────────────────────────────────┘
```

---

## 3. API contracts (authoritative)

### 3.1 REST — Negotiation Service ↔ PWA

Base: `https://{NEGOTIATION_SERVICE_URL}`. JSON only. Timestamps unix seconds. Bigints as decimal strings.

| # | Method | Path | Request | Response | Errors |
|---|---|---|---|---|---|
| 1 | POST | `/listing` | `PostListingRequest` | `PostListingResponse` (201) | 400 bad-request, 403 karma-tier-mismatch, 500 relayer-failed |
| 2 | POST | `/offer` | `PostOfferRequest` | `PostOfferResponse` (202) | 400, 403 rln-rejected, 403 karma-gate, 409 throughput-exceeded |
| 3 | GET | `/status/:negotiationId` | — | `GetStatusResponse` | 404 |
| 4 | GET | `/attestation/:dealId` | — | `NearAiAttestationBundle` (raw JSON from NEAR AI) | 404 |
| 5 | POST | `/attestation-receipt` | `PostAttestationReceiptRequest` | `{ok:true}` | 400, 404 |

**DTO changes vs V1 (types in `packages/shared/src/types.ts`):**

```ts
// REMOVED: EncryptedBlob, TeeAgreement, TeeFailure, TeeAttestation, GetTeePubkeyResponse

export interface PostListingRequest {
  seller: Address;
  askPrice: string;                       // wei as decimal
  requiredKarmaTier: KarmaTier;
  itemMeta: ListingMeta;
  plaintextMinSell: string;               // wei as decimal
  plaintextSellerConditions: string;      // utf-8, max 2KB, trimmed
}

export interface PostOfferRequest {
  buyer: Address;
  listingId: ListingId;
  bidPrice: string;                       // wei as decimal
  plaintextMaxBuy: string;                // wei as decimal
  plaintextBuyerConditions: string;       // utf-8, max 2KB, trimmed
  rlnProof: RLNProof;                     // UNCHANGED from V1
}

export interface NearAiAttestation {
  dealId: DealId;
  listingId: ListingId;
  offerId: OfferId;
  agreedPrice: string;                    // wei as decimal
  agreedConditions: AgreedConditions;
  modelId: string;                        // "qwen3-30b" etc.
  completionId: string;                   // NEAR AI chat_completion_id
  nonce: Hex;                             // keccak256(dealId || completionId)
  nearAiAttestationHash: Hex;             // keccak256(canonical(attestationBundle))
  attestationBundleUrl: string;           // /attestation/<dealId>
  ts: number;
}

export interface GetStatusResponse {
  negotiationId: DealId;
  state: 'queued' | 'running' | 'agreement' | 'fail' | 'settled';
  attestation?: NearAiAttestation;        // present when state in {agreement, settled}
  failureReason?: 'no_price_zopa' | 'conditions_incompatible' | 'llm_timeout';
  onchainTxHash?: Hex;
  updatedAt: number;
}
```

### 3.2 NEAR AI Cloud

**Base URL:** `https://cloud-api.near.ai/v1`
**Auth:** `Authorization: Bearer ${NEAR_AI_API_KEY}`
**Client:** `openai` npm SDK (v4+), configured with `baseURL`.

#### 3.2.1 Chat completion (condition parsing)

```
POST /v1/chat/completions
{
  "model": "qwen3-30b",
  "messages": [
    { "role": "system", "content": "<condition-parser system prompt>" },
    { "role": "user",   "content": "<concatenated seller + buyer text>" }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "ConditionPair",
      "strict": true,
      "schema": { "type": "object", "properties": {
          "seller": { "$ref": "#/$defs/Condition" },
          "buyer":  { "$ref": "#/$defs/Condition" }
        }, "required": ["seller","buyer"],
        "$defs": { "Condition": { ... see §3.1 ConditionStruct ... } }
      }
    }
  }
}
```

Response (OpenAI-compatible) includes `id` (the `completion_id` — 1:1 binding for nonce).

#### 3.2.2 Attestation report

```
GET /v1/attestation/report
    ?model=qwen3-30b
    &nonce=0x<keccak256(dealId || completion_id)>
    &signing_algo=ecdsa
```

Expected response shape (pinned by Agent B after P0 verification):

```jsonc
{
  "quote": "0x...",             // Intel TDX quote (signed by Intel PCS)
  "gpu_evidence": "0x...",      // NVIDIA attestation blob (for NRAS)
  "signing_key": "0x04...",     // secp256k1 pubkey (uncompressed)
  "signed_response": {
    "model": "qwen3-30b",
    "nonce": "0x...",
    "completion_id": "chatcmpl-...",
    "timestamp": 1713312345
  },
  "signature": "0x..."          // ecdsa(sha256(canonical(signed_response)))
}
```

**Agent B P0 acceptance check (Phase 0):** actual shape recorded in `docs/attestation-verification.md`. If NEAR AI returns a different shape than above, Agent B updates types and Agent D updates the verifier script; NO other agent needs to change.

### 3.3 Solidity ABI (V2)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IKarmaReader} from "./interfaces/IKarmaReader.sol";
import {IRLNVerifier} from "./interfaces/IRLNVerifier.sol";

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
    bytes32 agreedConditionsHash;      // keccak256 of canonical agreed conditions JSON
    bytes32 nearAiAttestationHash;     // NEW: keccak256 of canonical attestation bundle
    DealState state;
    uint64  createdAt;
    uint64  lockedUntil;
}

interface IBargoEscrow {
    // ─── errors ───
    error KarmaTierBelowRequired(uint8 have, uint8 need);
    error ThroughputExceeded(address who, uint256 current, uint256 max);
    error RLNProofInvalid();
    error ListingNotActive(bytes32 listingId);
    error DealNotLocked(bytes32 dealId);
    error DealNotPending(bytes32 dealId);
    error NotParticipant(address who);
    error AlreadyConfirmed(address who);
    error SettlementWindowOpen(bytes32 dealId);
    error ZeroAddress();
    error ZeroAmount();
    error WrongEscrowAmount(uint256 sent, uint256 required);
    error NotOwner();
    error NotRelayer();                 // NEW
    error AttestationHashZero();        // NEW

    // ─── events ───
    event ListingCreated(
        bytes32 indexed listingId, address indexed seller,
        uint256 askPrice, uint8 requiredKarmaTier, bytes32 itemMetaHash
    );
    event OfferSubmitted(
        bytes32 indexed listingId, bytes32 indexed offerId,
        address indexed buyer, uint256 bidPrice, bytes32 rlnNullifier
    );
    event NegotiationSettled(
        bytes32 indexed dealId,
        bytes32 indexed listingId,
        bytes32 indexed offerId,
        uint256 agreedPrice,
        bytes32 agreedConditionsHash,
        bytes32 nearAiAttestationHash   // NEW — judges filter by this topic
    );
    event EscrowLocked(bytes32 indexed dealId, address indexed buyer, uint256 amount);
    event MeetupConfirmed(bytes32 indexed dealId, address indexed by);
    event NoShowReported(bytes32 indexed dealId, address indexed reporter, address indexed accused);
    event ThroughputExceededEvent(address indexed who, uint256 current);
    event FundsReleased(bytes32 indexed dealId, address indexed seller, uint256 amount);
    event FundsRefunded(bytes32 indexed dealId, address indexed buyer, uint256 amount);
    event AttestationRelayerUpdated(address indexed previous, address indexed current); // NEW

    // ─── state ───
    function owner() external view returns (address);
    function attestationRelayer() external view returns (address); // NEW
    function karmaReader() external view returns (IKarmaReader);
    function rlnVerifier() external view returns (IRLNVerifier);
    function activeNegotiations(address who) external view returns (uint256);

    // ─── admin ───
    function setAttestationRelayer(address newRelayer) external; // NEW — onlyOwner

    // ─── state-changing ───
    function registerListing(
        uint256 askPrice,
        uint8   requiredKarmaTier,
        bytes32 itemMetaHash
    ) external returns (bytes32 listingId);

    function submitOffer(
        bytes32 listingId,
        uint256 bidPrice,
        bytes calldata rlnProof
    ) external returns (bytes32 offerId);

    /// NEW signature: relayer-only, no teeSignature, no enclaveId
    function settleNegotiation(
        bytes32 listingId,
        bytes32 offerId,
        uint256 agreedPrice,
        bytes32 agreedConditionsHash,
        bytes32 nearAiAttestationHash
    ) external returns (bytes32 dealId);

    function lockEscrow(bytes32 dealId) external payable;
    function confirmMeetup(bytes32 dealId) external;
    function reportNoShow(bytes32 dealId) external;
    function refund(bytes32 dealId) external;
    function cancelOffer(bytes32 dealId) external;

    // ─── views ───
    function getListing(bytes32 listingId) external view returns (Listing memory);
    function getDeal(bytes32 dealId) external view returns (Deal memory);
}
```

**Modifier semantics (Agent A must implement):**

```solidity
modifier onlyAttestationRelayer() {
    if (msg.sender != attestationRelayer) revert NotRelayer();
    _;
}
```

**Constructor diff:**

```solidity
// OLD: EIP712("Bargo v1", "1"), sets owner
// NEW: no EIP712 inheritance needed; store attestationRelayer at construction
constructor(address karmaReader_, address rlnVerifier_, address attestationRelayer_) {
    if (karmaReader_ == address(0)) revert ZeroAddress();
    if (rlnVerifier_ == address(0)) revert ZeroAddress();
    if (attestationRelayer_ == address(0)) revert ZeroAddress();
    owner = msg.sender;
    karmaReader = IKarmaReader(karmaReader_);
    rlnVerifier = IRLNVerifier(rlnVerifier_);
    attestationRelayer = attestationRelayer_;
}
```

**Deleted from V1 contract:**
- `addEnclaveSigner`, `enclaveSigner` mapping
- `EnclaveSignerAdded` event
- `_recoverSigner` internal
- `domainSeparator`, `_domainSeparatorV4` usage
- `AttestationLib` import + library usage
- Errors: `UnknownEnclave`, `AttestationSigInvalid`

---

## 4. Threat model deep-dive

| # | Attacker | Capability | Defense | Residual risk |
|---|---|---|---|---|
| 1 | Malicious NEAR AI operator | swaps model mid-inference; returns attacker-crafted JSON | `signed_response` binds `model`, `nonce`, `completion_id`. Off-chain verifier re-checks TDX measurement + NRAS GPU evidence against pinned values. | NEAR AI compromising Intel PCS signing (implausible) |
| 2 | Malicious service operator (turned bad at T+N) | reads live DB, extracts plaintext of open negotiations | DB plaintext lives **only** between offer receipt and settlement (~15s typical, 2min max). Auto-purge on `COMPLETED`. Redis-less design makes diff snapshots trivial to audit. | In-flight snooping remains possible — honestly documented |
| 3 | Counterparty | tries to extract the other side's floor/ceiling | API response shape: `/status/:id` returns only `agreedPrice` + `AgreedConditions` (merged). Reservation values never leave service. Listing public view has `askPrice` only, not `plaintextMinSell`. | User writes reservation in condition text — mitigated by UI placeholder + client-side string-length warning |
| 4 | Chain observer | replays old `nearAiAttestationHash` on a different dealId | `nonce = keccak256(dealId ‖ completion_id)` embedded in attestation; verifier re-derives and checks match. `dealId` is itself `keccak256(listingId ‖ offerId)` — deterministic and unique. | Attestation for dealId=X can only satisfy X; replay to Y fails |
| 5 | DB breach pre-settlement | full exfiltration of SQLite file | plaintext of live negotiations leaks (1 row per unsettled deal). Completed deals already purged. | Accept as honest tradeoff; document in demo. Mitigation: SQLite at-rest encryption via SQLCipher — **deferred post-hackathon** |
| 6 | DB breach post-settlement | full exfiltration | zero reservation data present (NULL columns); only settlement facts + attestation hashes | none |
| 7 | Relayer key leak | attacker calls `settleNegotiation` with arbitrary values | attacker can forge settled deals; deal has no backing escrow until buyer calls `lockEscrow` with exact agreedPrice; economic loss bounded to buyer's willingness to lock. Event log will show forged `nearAiAttestationHash` — off-chain verifier FAILS, judge can flag as fake. | Mitigation: `setAttestationRelayer` owner-only rotation. Post-hackathon: multisig |
| 8 | NEAR AI downtime | service cannot inference | return `failureReason: 'llm_timeout'` to client; 12s request budget; no fallback LLM in V2 (honest) | User retries or cancels — bounded by `SETTLEMENT_WINDOW` |
| 9 | Malformed NEAR AI JSON output | LLM returns non-conforming schema | `response_format: json_schema strict: true` rejects at source; secondary zod validation in engine; treat as `llm_timeout` equivalent | none |
| 10 | RLN sybil | mass wallets spam offers | existing V1 defense unchanged: `MAX_PER_EPOCH = 3` on `(nullifier, epoch)` | Karma tier gate still requires SNT stake |

---

## 5. Attestation verification flow — `scripts/verify-attestation.mjs`

**Language:** Node.js 20 (ESM). Dependencies (in `scripts/package.json`): `viem`, `@noble/secp256k1`, `@noble/hashes`, optional `@phala/dcap-qvl-web` if Intel quote parse works in-browser-style; otherwise shell out to `dcap-qvl` CLI (Rust binary, install via `cargo install dcap-qvl` or pinned release).

**Pseudocode (target implementation):**

```js
// scripts/verify-attestation.mjs
// Usage:
//   node verify-attestation.mjs --dealId 0x<bytes32>
//   node verify-attestation.mjs --file ./attestation.json

import { createPublicClient, http, keccak256, toHex } from 'viem';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';

const HOODI_RPC = process.env.HOODI_RPC ?? 'https://public.hoodi.rpc.status.network';
const NRAS_URL  = process.env.NVIDIA_NRAS_URL ?? 'https://nras.attestation.nvidia.com/v3/attest/gpu';
const SERVICE_BASE = process.env.SERVICE_URL ?? 'https://bargo.app';
const EXPECTED_MR_TD = process.env.NEAR_AI_MR_TD; // pinned TDX measurement, set by Agent D from NEAR AI docs

async function main() {
  const { dealId, file } = parseArgs();
  const attestation = file ? JSON.parse(readFileSync(file)) : await fetchAttestation(dealId);

  // 1. Canonical hash equals on-chain hash
  const onchainHash = await fetchOnchainAttestationHash(attestation.dealId);
  const computed = keccak256(canonicalize(attestation));
  assert(computed === onchainHash, 'ONCHAIN_HASH_MISMATCH');

  // 2. Nonce binding
  const expectedNonce = keccak256(concat([attestation.dealId, attestation.signed_response.completion_id]));
  assert(expectedNonce === attestation.signed_response.nonce, 'NONCE_MISMATCH');

  // 3. signed_response signature
  const msgHash = sha256(utf8ToBytes(canonicalize(attestation.signed_response)));
  assert(secp256k1.verify(attestation.signature, msgHash, attestation.signing_key), 'SIG_INVALID');

  // 4. NVIDIA NRAS
  const nras = await fetch(NRAS_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ evidence: attestation.gpu_evidence })
  }).then(r => r.json());
  assert(nras.verdict === 'PASS', `NRAS_FAIL: ${JSON.stringify(nras)}`);

  // 5. Intel TDX quote (shell out if no JS parser)
  const tdxVerdict = await runDcapQvl(attestation.quote);
  assert(tdxVerdict.mr_td === EXPECTED_MR_TD, 'MR_TD_MISMATCH');
  assert(tdxVerdict.status === 'OK', `TDX_FAIL: ${tdxVerdict.reason}`);

  console.log(JSON.stringify({ dealId: attestation.dealId, verdict: 'PASS' }, null, 2));
}

async function fetchOnchainAttestationHash(dealId) {
  const client = createPublicClient({ transport: http(HOODI_RPC) });
  const logs = await client.getContractEvents({
    address: BARGO_ESCROW_ADDRESS,
    abi: BARGO_ESCROW_ABI,
    eventName: 'NegotiationSettled',
    args: { dealId },
    fromBlock: 0n,
  });
  if (logs.length === 0) throw new Error('DEAL_NOT_SETTLED');
  return logs[0].args.nearAiAttestationHash;
}
```

**Decision: Node.js + viem + shell-out to `dcap-qvl`** for TDX parsing. Rationale: no published JS-only TDX parser is audited; shelling to the Rust tool is a 3-line install for judges and we stay in Node for everything else.

---

## 6. File ownership matrix

Legend: **O** owns (writes), **R** reads (imports types, does not edit), **—** must not touch.

| Path | Agent A (contracts) | Agent B (service) | Agent C (web) | Agent D (scripts/docs) |
|---|---|---|---|---|
| `contracts/src/**` | O | — | — | — |
| `contracts/test/**`, `contracts/script/**` | O | — | — | — |
| `apps/negotiation-service/src/**` | — | O | — | — |
| `apps/negotiation-service/test/**` | — | O | — | — |
| `apps/web/**` | — | — | O | — |
| `packages/shared/src/types.ts` | R (ABI types) | **O (primary)** | R | R |
| `packages/shared/src/schemas.ts` | — | O | R | — |
| `packages/shared/src/abi/*.ts` | O (regen from `forge build`) | R | R | R |
| `packages/shared/src/addresses.ts` | O (append post-deploy) | R | R | R |
| `scripts/verify-attestation.mjs` | — | R | — | O |
| `scripts/qa-*.mjs` | — | R | — | O |
| `docs/threat-model.md`, `docs/attestation-verification.md` | R | R | R | O |
| `docs/deployments.md` | O (append) | R | R | O |
| `PRD.md` | R | R | R | O |
| `README.md` | R | R | R | O |
| `.env.example` | append (CONTRACTS block) | append (NEG_SVC block) | append (WEB block) | O (coordinator) |

**Shared-types freeze:** Agent B writes `packages/shared/src/types.ts` + `schemas.ts` within first 2 hours of Phase 1. After that, changes require A+B+C sign-off in PR.

**ABI freeze:** Agent A publishes `contracts/src/BargoEscrow.sol` signature within first 2 hours; `forge build` regenerates ABI into `packages/shared/src/abi/` automatically. Post-freeze changes require A+B sign-off.

---

## 7. Phase plan

### Phase 0 — Setup (all agents; blocking)

| Task | Owner | Falsifiable exit |
|---|---|---|
| 0.1 Obtain `NEAR_AI_API_KEY`; `curl` a hello prompt against `qwen3-30b` | B (leads), D (docs) | Successful 200 response with `completion.id` present |
| 0.2 Fetch sample attestation report with a random nonce | B | Response body captured into `docs/attestation-verification.md`; schema confirmed matches §3.2.2 or documented deviation |
| 0.3 Obtain Hoodi RPC URL + deployer key + faucet balance | A | `cast balance <deployer> --rpc-url ...` > 0 |
| 0.4 Verify `dcap-qvl` + `NVIDIA NRAS` endpoints are accessible from dev laptop | D | `curl` both return expected structure on a known-good sample |
| 0.5 Pin expected TDX `MR_TD` value from NEAR AI documentation | D | Value committed to `docs/attestation-verification.md` |

**Gate:** all 5 green. Failure → raise to user, re-plan.

### Phase 1 — Isolated rewrites (parallel, no cross-dependencies)

Can start in parallel once Phase 0 complete and types are frozen (Agent B's 2-hour lead).

#### Task 1.1 — Contracts (Agent A)
Files owned: `contracts/src/BargoEscrow.sol`, `contracts/test/BargoEscrow.t.sol`, `contracts/script/Deploy.s.sol`, delete `contracts/src/libs/AttestationLib.sol`, delete `contracts/test/AttestationLib.t.sol`.

Steps:
1. Delete `libs/AttestationLib.sol` + its test.
2. Remove `EIP712` inheritance, `enclaveSigner` mapping, `addEnclaveSigner`, `_recoverSigner`, `domainSeparator`, `EnclaveSignerAdded`, `UnknownEnclave`, `AttestationSigInvalid`.
3. Add `attestationRelayer` state, `onlyAttestationRelayer` modifier, `setAttestationRelayer(address)` admin fn, `AttestationRelayerUpdated` event, `NotRelayer`, `AttestationHashZero` errors.
4. Rewrite `settleNegotiation` signature to §3.3; store `agreedConditionsHash` + `nearAiAttestationHash` on `Deal`.
5. Update `NegotiationSettled` event with indexed `nearAiAttestationHash`.
6. Rewrite `BargoEscrow.t.sol`: replace EIP-712/signature tests with relayer-auth tests (happy path, non-relayer revert, zero-hash revert, relayer rotation).
7. Update `Deploy.s.sol`: pass `attestationRelayer` into constructor; no `addEnclaveSigner` call.

**Demoable output:** `forge test` green; deployed to Hoodi with `RELAYER_ADDRESS` in `docs/deployments.md`. Judge can call `settleNegotiation` from anywhere — reverts with `NotRelayer`.

#### Task 1.2 — Negotiation service (Agent B)
Files owned: `apps/negotiation-service/src/**`, `apps/negotiation-service/test/**`, `packages/shared/src/{types,schemas,index}.ts`.

Steps:
1. Write new `packages/shared/src/types.ts` per §3.1; update `schemas.ts`; remove `EncryptedBlob`/`TeeAttestation` exports; commit in first 2h of Phase 1.
2. Delete `src/tee/` directory entirely.
3. Create `src/nearai/client.ts`: wraps OpenAI SDK with `baseURL = https://cloud-api.near.ai/v1`; exposes `parseConditions({listingTitle, sellerText, buyerText})`.
4. Create `src/nearai/attestation.ts`: `fetchAttestation({model, nonce, dealId, completionId})` returns `NearAiAttestation`; computes `nearAiAttestationHash = keccak256(canonicalize(bundle))`; writes bundle to `./data/attestations/<dealId>.json`.
5. Create `src/negotiate/engine.ts`: orchestration per §2.2 step diagram; return type is `NegotiationResult = NearAiAttestation | {failureReason}`.
6. Create `src/negotiate/conditions.ts`: system prompt + JSON-schema string for NEAR AI call.
7. Create `src/negotiate/karmaWeight.ts`: port logic from `services/tee/bargo_tee/karma_weight.py`.
8. Create `src/chain/relayer.ts`: uses `viem` WalletClient with `RELAYER_PRIVATE_KEY` to send `settleNegotiation` tx; returns `onchainTxHash`; updates `negotiations.onchain_tx_hash`.
9. Modify `src/db/schema.sql`: replace `enc_min_sell_json`, `enc_seller_conditions_json` with `plaintext_min_sell TEXT`, `plaintext_seller_conditions TEXT`; same for offers; add `near_ai_attestation_hash`, `agreed_conditions_hash`, `agreed_conditions_json`, `model_id`, `completion_id` columns on `negotiations`; add `AFTER UPDATE ON negotiations WHEN NEW.state = 'completed'` trigger that NULLs plaintext columns.
10. Modify `src/db/client.ts` + all `routes/*.ts` to match new schema and DTOs.
11. Delete `routes/teePubkey.ts`; remove its registration in `routes/index.ts`.
12. Add `routes/attestation.ts` handler for `GET /attestation/:dealId` that streams the saved JSON.
13. Rewrite `test/routes.test.ts` for plaintext DTOs; delete `test/mock-tee.test.ts`; add `test/engine.test.ts` (mock NEAR AI response via MSW or vi.mock) + `test/attestation.test.ts` (fixture-based hash check).
14. `src/config.ts`: add `NEAR_AI_API_KEY`, `NEAR_AI_MODEL` (default `qwen3-30b`), `RELAYER_PRIVATE_KEY`, `BARGO_ESCROW_ADDRESS`; remove `TEE_*`, `MOCK_TEE`.

**Demoable output:** `pnpm -C apps/negotiation-service test` green; `curl -X POST /listing` + `/offer` happy path returns 202 and polling `/status` reaches `settled` with real on-chain tx on Hoodi. `GET /attestation/<dealId>` returns a verifiable bundle.

#### Task 1.3 — Web (Agent C)
Files owned: `apps/web/**`.

Steps:
1. Delete `apps/web/lib/encrypt.ts`.
2. Modify `apps/web/lib/api.ts`: plaintext DTOs per §3.1; drop `sealBlob` calls.
3. Modify `apps/web/app/listings/new/page.tsx`: remove seal step; send `plaintextMinSell` + `plaintextSellerConditions` in POST body.
4. Modify `apps/web/app/offers/new/[listingId]/page.tsx`: same pattern; keep RLN proof generation.
5. Create `apps/web/components/AttestationViewer.tsx`: displays `modelId`, `completionId`, truncated `nearAiAttestationHash`, button "Verify" linking to `https://<service>/attestation/<dealId>` and copy-paste `node verify-attestation.mjs --dealId 0x...` snippet.
6. Modify `apps/web/app/deals/[id]/page.tsx`: render `AttestationViewer` when `state == settled`.
7. Update `apps/web/test/*` for plaintext DTOs (12 of 22 tests touch encrypt — rewrite them).
8. Update the UX findings that are still valid (safe-area from `docs/ux-review.md`), unchanged from V1.

**Demoable output:** `pnpm -C apps/web test` green; local end-to-end against Agent B's service; listing + offer forms submit plaintext; deal detail page shows attestation hash + "Verify" button.

#### Task 1.4 — Scripts + docs (Agent D)
Files owned: `scripts/verify-attestation.mjs`, `scripts/qa-*.mjs`, `docs/threat-model.md`, `docs/attestation-verification.md`, `README.md`, `PRD.md` (§2.6–2.9 rewrite), `.env.example`.

Steps:
1. Write `docs/threat-model.md` from §4 of this plan.
2. Write `docs/attestation-verification.md`: NEAR AI endpoint shapes, pinned `MR_TD`, NRAS URL, step-by-step judge instructions.
3. Write `scripts/verify-attestation.mjs` per §5 pseudocode; add `scripts/package.json` deps (`viem`, `@noble/*`); smoke test against a Phase-0 captured fixture.
4. Delete `scripts/qa-seal.mjs`; update `scripts/qa-scenarios.mjs` + `scripts/qa-web-bug-repro.mjs` for plaintext DTOs.
5. Rewrite `PRD.md` §2.6 (architecture — NEAR AI instead of self TEE), §2.7 (data model — no enc fields), §2.8 (algorithm — plaintext inputs), §2.9 (threat table). Keep §2.4 user stories intact (acceptance criteria still valid in spirit — remove "TEE 공개키로 암호화" language).
6. Rewrite `README.md`: new architecture diagram, new demo-day checklist (no `MOCK_TEE`, needs `NEAR_AI_API_KEY` + `RELAYER_PRIVATE_KEY`), verifier usage.
7. Rewrite `.env.example`: remove `TEE_*`, `MOCK_TEE`; add `NEAR_AI_API_KEY`, `NEAR_AI_MODEL`, `NEAR_AI_BASE_URL`, `RELAYER_PRIVATE_KEY`, `RELAYER_ADDRESS`, `NEAR_AI_MR_TD`, `NVIDIA_NRAS_URL`.
8. Update `.github/workflows/ci.yml`: remove pytest step; add `node scripts/verify-attestation.mjs --file test-fixtures/sample-attestation.json` smoke test.

**Demoable output:** `node scripts/verify-attestation.mjs --file test-fixtures/sample-attestation.json` outputs `{ verdict: "PASS" }` using a real captured attestation.

### Phase 2 — Integration

Single thread; needs all Phase 1 outputs merged.

| Task | Owners | Gate |
|---|---|---|
| 2.1 Deploy contracts to Hoodi with real `attestationRelayer` = wallet derived from `RELAYER_PRIVATE_KEY` | A | `cast call <deployed>` returns relayer address |
| 2.2 Write deployed addresses into `packages/shared/src/addresses.ts`; Agent B pulls + restarts service | A + B | `GET /status/:id` after new offer eventually sets `onchainTxHash` |
| 2.3 End-to-end demo: seller on Phone 1 lists; buyer on Phone 2 offers; agreement in ≤15s; tx visible on Hoodi explorer; Phase-1 verifier passes against the emitted `nearAiAttestationHash` | all | Scripted run in `docs/demo-script.md` completes in <3min twice |
| 2.4 Condition-mismatch demo: buyer/seller with contradictory time windows → `state: fail`, `failureReason: conditions_incompatible`; still produces attestation hash proving NEAR AI was called | all | UI shows only "협상 실패" — no leak of which condition failed |
| 2.5 Auto-purge verification: complete a deal, inspect SQLite `plaintext_min_sell` → NULL | B | `sqlite3 data/bargo.db ".dump listings"` shows NULL |

### Phase 3 — Demo + video

| Task | Owners | Gate |
|---|---|---|
| 3.1 Rehearse 2-phone demo twice | all | <3min each, no code touches |
| 3.2 Record backup video | D | mp4 committed (or linked) |
| 3.3 Judge-path dry run: hand verifier script to a teammate, have them verify a prod-deal in ≤2min | D | success log pasted into `docs/demo-script.md` |
| 3.4 Track submissions (NEAR AI, Status) | D | links captured |

---

## 8. Open questions

| # | Question | Proposed answer | Owner |
|---|---|---|---|
| 1 | Does NEAR AI attestation endpoint accept arbitrary 32-byte hex nonces? | Yes per their OpenAPI; confirm in P0 | B in P0 |
| 2 | Does NEAR AI's `signed_response` include `completion_id`, or do we need to pass it as part of nonce only? | Assume **yes** (most TEE platforms bind the inference ID); if no, we strengthen by making nonce = `keccak256(dealId || completion_id || agreedPrice)` and include a server-signed receipt | B in P0 |
| 3 | What is the pinned `MR_TD` measurement for NEAR AI's TDX image? | Fetch from their docs or a sample report; commit as `NEAR_AI_MR_TD` in `.env.example` | D in P0 |
| 4 | Is gasless relaying still needed for buyer/seller interactions given that only our relayer submits `settleNegotiation`? | **Still yes** — buyer calls `lockEscrow` (gasless requirement) and `confirmMeetup`. Unchanged from V1 Status Network path | C |
| 5 | Should we store full attestation JSON on-chain (gas cost vs verifiability)? | **No** — only the hash; we serve the full JSON via `GET /attestation/:dealId`. Trade-off: requires service uptime for verification. Post-hackathon: IPFS pin | A |
| 6 | How do we prove to the judge that our service didn't swap the attestation JSON between storing-on-disk and serving? | The canonical JSON hash on-chain is immutable. Any substitution breaks the equality check in step 1 of verifier. Good enough | D |
| 7 | Is the OpenAI SDK's `response_format: json_schema` supported by NEAR AI against `qwen3-30b`? | Yes per their compatibility notes; fallback to instructional prompt + zod validation if not | B in P0 |
| 8 | Does deleting `services/tee/` break CI? | Yes — remove pytest step in CI workflow (Agent D Task 1.4) | D |
| 9 | Who owns rotating `RELAYER_PRIVATE_KEY` if it leaks during the hackathon? | Agent A via `setAttestationRelayer`. Document in `docs/deployments.md` | A |
| 10 | Should `NegotiationSettled` still have 3 indexed topics (max) or can we squeeze `nearAiAttestationHash` as 4th? | Solidity limit = 3 indexed topics for non-anonymous events. We index `dealId`, `listingId`, `nearAiAttestationHash` (drop `offerId` from indexed → move to data). Priority: verifier needs `nearAiAttestationHash` filtering most | A |

---

## 9. Non-goals (explicit)

- Client-side encryption (removed — decision locked).
- Self-hosted TEE (removed — decision locked).
- Running custom code inside NEAR AI's TEE — their `/v1/chat/completions` endpoint is the only inference surface we use; NEAR AI's `agents` platform is out of scope for a 48h hackathon.
- NEAR Protocol blockchain interaction — optional `near-connect` wallet widget only; no NEAR chain writes.
- Multi-turn free-form LLM negotiation (§PRD 2.3).
- Production key management (HSM, multisig, KMS) — `RELAYER_PRIVATE_KEY` lives in `.env.local` + service host env for demo; documented honestly.
- Forward-secret transport encryption above HTTPS — TLS is sufficient for hackathon; no extra hybrid encryption.
- SQLite at-rest encryption (SQLCipher) — deferred; auto-purge + honest threat-model disclosure is the hackathon answer.

---

## 10. Fit-check (R × S alignment)

| Requirement (R) | Mechanism (S) | Non-tautological? |
|---|---|---|
| Judge cannot verify our TEE is real | `verify-attestation.mjs` + on-chain `nearAiAttestationHash` | R ≠ S — yes |
| User cannot trust operator not to peek | Honest threat model + auto-purge trigger + short plaintext window | R ≠ S — yes |
| Counterparty cannot learn the other's floor | Service never returns reservation values in any endpoint | R ≠ S — yes |
| Attacker cannot replay old attestation | `nonce = keccak256(dealId ‖ completion_id)` binding | R ≠ S — yes |

No tautologies; no ⚠️ uncertain mappings.

---

*End of PLAN_V2.md — frozen after Phase 0 gate. Post-freeze changes require A+B+C sign-off.*
