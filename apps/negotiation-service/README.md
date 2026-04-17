# Bargo Negotiation Service (V3)

Fastify service that brokers peer-to-peer negotiation using NEAR AI Cloud (Intel TDX + NVIDIA GPU TEE) as the trusted inference provider. Handles sealed-bid ephemeral decryption, RLN rate-limiting, Karma gating, standing-intent auto-discovery, and on-chain settlement via an attestation relayer.

## Architecture

```
GET  /service-pubkey (X25519 pubkey — clients seal blobs to this)
POST /listing  (sealed EncryptedBlob for floor + conditions)
POST /offer    (sealed EncryptedBlob for ceiling + conditions + RLN proof)
  → RLN verify + Karma gate
  → INSERT listing/offer rows (enc_* blobs only — no plaintext in DB)
  → runNegotiation() [background]
      A. decryptReservationEphemeral() — ~10ms window, plaintext NEVER logged
      B. ZOPA check (maxBuyWei >= minSellWei)
      C. parseConditionsPair -> NEAR AI qwen3-30b (json_schema response_format)
      D. matchConditions (location ∩ time ∩ payment)
      E. computeAgreedPrice (karma-weighted split)
      F. fetchAttestation (GET /v1/attestation/report?nonce=keccak256(dealId||completionId))
      G. saveAttestationBundle -> ./data/attestations/<dealId>.json
      H. submitSettlement -> BargoEscrow.settleNegotiation() on-chain

Background: startMatchmaker()
  → watches ListingCreated chain events (5s polling)
  → for each new listing x active intent: apply public filters,
    decryptIntentConditions() ephemeral, callNearAiMatcher(), insert IntentMatch
```

**Privacy invariant**: plaintext (minSellWei, maxBuyWei, sellerConditions, buyerConditions) exists only in ephemeral request-scope memory during step A above. Never written to DB, logs, or disk.

## How runNegotiation works

1. **Ephemeral decrypt**: `decryptReservationEphemeral` reconstructs all four plaintext values in memory using X25519 ECDH + HKDF-SHA256 + XChaCha20-Poly1305. Caller must not log the returned object.
2. **ZOPA check**: if `maxBuyWei < minSellWei`, returns `fail('no_price_zopa')` without calling NEAR AI.
3. **Condition parsing**: calls NEAR AI `POST /v1/chat/completions` with `response_format: json_schema`. Parses free-text conditions into `ConditionStruct` (location slugs, day/hour windows, payment methods). Timeout or malformed response returns `fail('llm_timeout')`.
4. **Condition matching**: intersects location, time windows, and payment methods. No overlap returns `fail('conditions_incompatible')`.
5. **Price computation**: `weight = 0.5 + 0.05 * (sellerTier - buyerTier)`, clamped `[0.35, 0.65]`. `agreedPrice = floor(minSell + (maxBuy - minSell) * weight)`.
6. **Attestation**: `nonce = keccak256(dealId || completionId)`. Calls `GET /v1/attestation/report?model=...&nonce=...&signing_algo=ecdsa`. Validates response against `nearAiAttestationBundleSchema`.
7. **Settlement**: relayer submits `settleNegotiation(listingId, offerId, agreedPrice, agreedConditionsHash, nearAiAttestationHash)` to BargoEscrow on-chain.

## Environment variables

Copy `.env.example` and fill in the required values.

| Variable | Required | Default | Description |
|---|---|---|---|
| `SERVICE_DECRYPT_SK` | **yes** | — | 32-byte X25519 private key for sealed blob decryption |
| `NEAR_AI_API_KEY` | **yes** | — | NEAR AI Cloud API key |
| `RELAYER_PRIVATE_KEY` | **yes** | — | 0x-prefixed 32-byte hex relayer key |
| `NEAR_AI_BASE_URL` | no | `https://cloud-api.near.ai/v1` | NEAR AI base URL |
| `NEAR_AI_MODEL` | no | `qwen3-30b` | LLM model name |
| `NEAR_AI_TIMEOUT_MS` | no | `8000` | LLM call timeout in ms |
| `HOODI_RPC_URL` | no | `https://public.hoodi.rpc.status.network` | Status Network Hoodi RPC |
| `BARGO_ESCROW_ADDRESS` | no | `0x000...` | BargoEscrow contract address |
| `KARMA_READER_ADDRESS` | no | `0x000...` | KarmaReader contract address |
| `RLN_VERIFIER_ADDRESS` | no | `0x000...` | RLNVerifier contract address |
| `DB_PATH` | no | `./data/bargo.db` | SQLite database path |
| `ATTESTATION_DIR` | no | `./data/attestations` | Attestation bundle directory |
| `PORT` | no | `3001` | HTTP port |

## Running (dev)

```bash
cp .env.example .env
# Fill in SERVICE_DECRYPT_SK, NEAR_AI_API_KEY, and RELAYER_PRIVATE_KEY
pnpm dev
```

On startup, the service runs a **Phase-0 acceptance check**: calls `GET /v1/attestation/report` with a dummy nonce and validates the response shape against `nearAiAttestationBundleSchema`. If the shape does not match, a WARN is logged and the service continues (the check passes silently in CI without a valid API key).

## REST API

| Method | Path | Response | Notes |
|--------|------|----------|-------|
| GET | `/service-pubkey` | 200 `{ pubkey: Hex, issuedAt: number }` | X25519 pubkey for sealing blobs |
| POST | `/listing` | 201 `{ listingId, onchainTxHash: null }` | Accepts sealed enc_* blobs only |
| POST | `/offer` | 202 `{ offerId, negotiationId, status:'queued' }` | Fires NEAR AI async; poll /status |
| GET | `/status/:negotiationId` | 200 `GetStatusResponse` | States: queued→running→agreement/fail→settled |
| GET | `/attestation/:dealId` | 200 `NearAiAttestationBundle` | Raw NEAR AI bundle JSON |
| POST | `/attestation-receipt` | 200 `{ ok: true }` | Records acknowledgement |
| POST | `/intents` | 201 `{ intentId }` | Register sealed standing intent |
| GET | `/intent-matches` | 200 `{ matches: IntentMatch[] }` | Poll matchmaker results |

## Attestation bundle storage

Each successful negotiation writes `./data/attestations/<dealId>.json` in RFC 8785 canonical JSON. Served verbatim by `GET /attestation/:dealId`. Judges verify by:

1. `curl https://<service>/attestation/<dealId>` to fetch the bundle
2. Read `nearAiAttestationHash` from the `NegotiationSettled` on-chain event
3. Compute `keccak256(canonical(bundle))` — must equal the on-chain hash
4. Run `node scripts/verify-attestation.mjs --dealId <dealId>` for full TDX + NRAS verification

## DB privacy model (V3)

The V3 schema contains no plaintext columns. All reservation data is stored as AEAD-protected `enc_*` blobs — safe to retain indefinitely without purging. Plaintext is reconstructed only in ephemeral request-scope memory and discarded immediately after the NEAR AI call. No auto-purge trigger is needed or present.

## Auto-discovery (Standing Intents)

Buyers register a sealed *standing intent* once; the matchmaker background worker discovers matching listings automatically.

### Flow

1. Buyer calls `POST /intents` with a sealed budget (`encMaxBuy`) and sealed natural-language conditions (`encBuyerConditions`), plus optional public filters (`category`, `requiredKarmaTierCeiling`) and an expiry timestamp.
2. The service stores the intent (enc blobs at rest, never decrypted at registration time) and returns a server-assigned `intentId`.
3. **Matchmaker loop** — runs in the background on the service:
   - Subscribes to `ListingCreated` chain events via `watchContractEvent` (5 s polling interval).
   - On each new listing: fetches all active non-expired intents from DB.
   - **Public filter pass**: skip intent if `filters.category` mismatches listing's category, or `filters.requiredKarmaTierCeiling < listing.requiredKarmaTier`.
   - **Ephemeral decrypt**: decrypts `encBuyerConditions` in-memory using the fixed intent AAD (`keccak256("bargo-intent-v1")`). The plaintext exists only for the duration of the NEAR AI call and is immediately discarded. **It is never logged, never stored, never returned through any API.**
   - **NEAR AI scoring**: calls `POST /v1/chat/completions` with listing metadata + decrypted conditions. Model responds with `{ score: "match" | "likely" | "uncertain", reason: "<≤100 chars, public>" }`.
   - If `score != "uncertain"`, inserts an `intent_matches` row.
   - Also runs a 60 s periodic sweep as a safety net for any missed chain events.
4. Buyer polls `GET /intent-matches?buyer=0x...` for notifications. Each match includes listing metadata, score, and public reason — never the decrypted conditions.
5. Buyer calls `POST /intent-matches/ack` to acknowledge a notification.

### Privacy invariant

The decrypted buyer conditions (`encBuyerConditions` plaintext) exist only inside the matchmaker's ephemeral match-evaluation scope. No log sink, DB column, or API response ever receives this value. The `finally` block in `evaluateListingAgainstIntent` zeroes the local variable immediately after the NEAR AI call.

### Intent AAD

Intent blobs are sealed with AAD = `keccak256("bargo-intent-v1")` (32 bytes). This constant is distinct from the listing-bound AAD (`buildListingAad(listingId)`), preventing cross-context decryption. Both the service (`src/matchmaker.ts`) and the web client must use the same 32-byte value when sealing/opening intent blobs.

### REST API (intents)

| Method | Path | Response | Notes |
|--------|------|----------|-------|
| POST | `/intents` | 201 `{ intentId }` | Register sealed intent |
| GET | `/intents?buyer=0x...` | 200 `{ intents[] }` | Public fields only — no enc blobs |
| DELETE | `/intents/:id?buyer=0x...` | 200 `{ ok: true }` | Deactivate; buyer ownership enforced |
| GET | `/intent-matches?buyer=0x...` | 200 `GetIntentMatchesResponse` | Match notifications with listing metadata |
| POST | `/intent-matches/ack` | 200 `{ ok: true }` | Mark match acknowledged |

## Tests

```bash
pnpm test
```

64 tests: 8 RLN, 10 attestation, 6 engine, 12 routes, 18 intents routes, 6 matchmaker unit, 2 watcher, 2 crypto.
