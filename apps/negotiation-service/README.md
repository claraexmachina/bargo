# Bargo Negotiation Service (V2)

Fastify service that brokers peer-to-peer negotiation using NEAR AI Cloud (Intel TDX + NVIDIA GPU TEE) as the trusted inference provider. Handles RLN rate-limiting, Karma gating, plaintext condition parsing, and on-chain settlement via an attestation relayer.

## Architecture

```
POST /offer
  → RLN verify + Karma gate
  → INSERT offer (plaintext)
  → runNegotiation() [background]
      A. ZOPA check (buyerMax >= sellerMin)
      B. parseConditionsPair -> NEAR AI qwen3-30b (json_schema response_format)
      C. matchConditions (location ∩ time ∩ payment)
      D. computeAgreedPrice (karma-weighted split)
      E. fetchAttestation (GET /v1/attestation/report?nonce=keccak256(dealId||completionId))
      F. saveAttestationBundle -> ./data/attestations/<dealId>.json
      G. submitSettlement -> BargoEscrow.settleNegotiation() on-chain
```

## How runNegotiation works

1. **ZOPA check**: if `buyerMax < sellerMin`, immediately returns `fail('no_price_zopa')` without calling NEAR AI.
2. **Condition parsing**: calls NEAR AI `POST /v1/chat/completions` with `response_format: json_schema`. The model parses free-text Korean/English conditions into structured `ConditionStruct` (location slugs, day/hour windows, payment methods). On timeout or malformed response, returns `fail('llm_timeout')`.
3. **Condition matching**: intersects location, time windows, and payment methods. If no overlap on any axis, returns `fail('conditions_incompatible')`.
4. **Price computation**: `weight = 0.5 + 0.05 * (sellerTier - buyerTier)`, clamped `[0.35, 0.65]`. `agreedPrice = floor(sellerMin + (buyerMax - sellerMin) * weight)`.
5. **Attestation**: `nonce = keccak256(dealId || completionId)`. Calls `GET /v1/attestation/report?model=...&nonce=...&signing_algo=ecdsa`. Validates response against `nearAiAttestationBundleSchema`.
6. **Settlement**: relayer submits `settleNegotiation(listingId, offerId, agreedPrice, agreedConditionsHash, nearAiAttestationHash)` to BargoEscrow on-chain.

## Environment variables

Copy `.env.example` and fill in the required values.

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEAR_AI_API_KEY` | **yes** | — | NEAR AI Cloud API key |
| `NEAR_AI_BASE_URL` | no | `https://cloud-api.near.ai/v1` | NEAR AI base URL |
| `NEAR_AI_MODEL` | no | `qwen3-30b` | LLM model name |
| `NEAR_AI_TIMEOUT_MS` | no | `8000` | LLM call timeout in ms |
| `RELAYER_PRIVATE_KEY` | **yes** | — | 0x-prefixed 32-byte hex relayer key |
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
# Fill in NEAR_AI_API_KEY and RELAYER_PRIVATE_KEY — no MOCK_TEE needed
pnpm dev
```

On startup, the service runs a **Phase-0 acceptance check**: calls `GET /v1/attestation/report` with a dummy nonce and validates the response shape against `nearAiAttestationBundleSchema`. If the shape does not match, a WARN is logged and the service continues (the check passes silently in CI without a valid API key).

## REST API

| Method | Path | Response | Notes |
|--------|------|----------|-------|
| POST | `/listing` | 201 `{ listingId, onchainTxHash: null }` | Plaintext reservation accepted |
| POST | `/offer` | 202 `{ offerId, negotiationId, status:'queued' }` | Fires NEAR AI async; poll /status |
| GET | `/status/:negotiationId` | 200 `GetStatusResponse` | States: queued→running→agreement/fail→settled |
| GET | `/attestation/:dealId` | 200 `NearAiAttestationBundle` | Raw NEAR AI bundle JSON |
| POST | `/attestation-receipt` | 200 `{ ok: true }` | Records acknowledgement |

## Attestation bundle storage

Each successful negotiation writes `./data/attestations/<dealId>.json` in RFC 8785 canonical JSON. Served verbatim by `GET /attestation/:dealId`. Judges verify by:

1. `curl https://<service>/attestation/<dealId>` to fetch the bundle
2. Read `nearAiAttestationHash` from the `NegotiationSettled` on-chain event
3. Compute `keccak256(canonical(bundle))` — must equal the on-chain hash
4. Run `node scripts/verify-attestation.mjs --dealId <dealId>` for full TDX + NRAS verification

## DB privacy (auto-purge)

Plaintext columns (`plaintext_min_sell`, `plaintext_seller_conditions`, `plaintext_max_buy`, `plaintext_buyer_conditions`) are NULLed automatically when `negotiations.state` reaches `'completed'` via a SQLite trigger. Completed deals retain only: `agreed_price`, `agreed_conditions_hash`, `near_ai_attestation_hash`, `attestation_bundle_path`.

## Tests

```bash
pnpm test
```

34 tests: 8 RLN, 10 attestation (fixture-based hash + disk I/O), 5 engine (mocked NEAR AI), 11 routes (plaintext DTOs).
