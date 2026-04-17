# Bargo

> NEAR AI TEE x Status Network — P2P negotiation automation

**Status: V3 demo-ready (sealed-bid + auto-discovery + ephemeral decrypt)**

AI bots negotiate both sides' reservation prices and natural-language conditions privately. Clients encrypt reservation data with X25519 before sending it to the service. The service decrypts ephemerally in request-scope memory, passes plaintext into NEAR AI Cloud (Intel TDX + NVIDIA GPU TEE), then discards it immediately — never written to DB, logs, or disk. Negotiation outcome is independently verifiable by judges.

- [PRD](./PRD.md) — problem definition, user stories, demo scenario (§2.12)
- [Threat model](./docs/threat-model.md) — V3 honest trust model (10-row threat table)
- [Attestation verification](./docs/attestation-verification.md) — judge verification guide

## Architecture

```
Web (Next.js PWA) ──[sealed blob]──► Negotiation Service (Fastify + SQLite, V3 ephemeral decrypt)
                                              │
                                    ┌─────────▼─────────────────────────┐
                                    │  NEAR AI Cloud (Intel TDX + GPU)  │
                                    │  qwen3-30b LLM, /v1/attestation   │
                                    └─────────┬─────────────────────────┘
                                              │ nearAiAttestationHash
                                    ┌─────────▼─────────────────────────┐
                                    │  Status Network Hoodi              │
                                    │  BargoEscrow, KarmaReader,         │
                                    │  RLNVerifier                       │
                                    └────────────────────────────────────┘
```

**Trust model summary**: The service operator handles ciphertext in transit and at rest. Plaintext exists only in ephemeral request-scope memory (~10 ms typical) inside `decryptReservationEphemeral` while packaging the NEAR AI prompt. It is never written to the database, never logged, and never written to disk. NEAR AI TEE inference is independently verifiable via `verify-attestation.mjs`.

**Gasless status**: Gasless is temporarily suspended on Status Network Hoodi due to an RLN prover issue (announced by the organiser). The service integrates `linea_estimateGas` and is **gasless-ready** — will switch automatically once the fix ships. Until then, paid gas is used.

## Sealed-bid flow

1. Seller calls `GET /service-pubkey` to fetch the service's X25519 public key.
2. Seller seals floor price + conditions to that key (`EncryptedBlob`), submits `POST /listing`.
3. Buyer fetches the same pubkey, seals ceiling + conditions, submits `POST /offer` with RLN proof.
4. Service ephemerally decrypts all four blobs in memory, checks ZOPA, calls NEAR AI.
5. NEAR AI (inside Intel TDX + NVIDIA GPU TEE) parses conditions, computes Karma-weighted `agreedPrice`.
6. Relayer submits `settleNegotiation(agreedPrice, nearAiAttestationHash)` on-chain.
7. Only `agreedPrice` and `AgreedConditions` (merged meetup result) are ever revealed — never the raw floor or ceiling.
8. Buyer calls `lockEscrow(dealId, {value: agreedPrice})`; on successful in-person exchange, buyer calls `confirmMeetup(dealId)` and the contract releases funds to the seller in the same tx.

## Standing Intents (auto-discovery)

Buyers can set a standing sealed intent via `POST /intents`: a sealed budget ceiling + natural-language conditions + public category/tier filters. The background matchmaker watches for `ListingCreated` chain events, applies public filters, then ephemerally decrypts the buyer's conditions and asks NEAR AI whether the listing matches. On a `match` or `likely` score, an `IntentMatch` row is inserted. The buyer's web client polls `GET /intent-matches` for notifications. Buyer conditions are never stored decrypted and never logged.

## Quick start

```bash
# Prerequisites: pnpm 9, Node 20+, Foundry
pnpm install
cp .env.example .env.local   # fill in variables below
```

```bash
# Terminal 1 — negotiation service
cd apps/negotiation-service && pnpm dev

# Terminal 2 — web
cd apps/web && pnpm dev
```

Open http://localhost:3000 → Connect wallet (Hoodi chainId 374) → Create listing (sealed floor) → Submit offer (sealed ceiling) → Bot vs bot negotiation → View agreement result → Buyer locks escrow → Buyer confirms meetup (single tx releases funds to seller)

## Environment variables

```bash
# Service encryption key (X25519, generated at deploy time)
SERVICE_DECRYPT_SK=0x...            # 32-byte X25519 private key for the service

# NEAR AI
NEAR_AI_API_KEY=your_near_ai_api_key
NEAR_AI_MODEL=qwen3-30b             # default

# Relayer (service signs+sends settleNegotiation tx)
RELAYER_PRIVATE_KEY=0x...
ATTESTATION_RELAYER_ADDRESS=0x...   # derived from RELAYER_PRIVATE_KEY

# Contracts (Hoodi chain 374)
BARGO_ESCROW_ADDRESS=0x...
KARMA_READER_ADDRESS=0x...
RLN_VERIFIER_ADDRESS=0x...

# Web
NEXT_PUBLIC_NEGOTIATION_SERVICE_URL=http://localhost:3001
NEXT_PUBLIC_HOODI_RPC_URL=https://public.hoodi.rpc.status.network

# Verifier (off-chain attestation check by judges)
HOODI_RPC=https://public.hoodi.rpc.status.network
NEAR_AI_MR_TD=<pinned TDX measurement from NEAR AI docs>
NVIDIA_NRAS_URL=https://nras.attestation.nvidia.com/v3/attest/gpu
```

## Per-package commands

| Package / App | Command |
|---|---|
| `packages/shared` | `pnpm -C packages/shared typecheck` |
| `apps/web` | `pnpm -C apps/web dev` |
| `apps/negotiation-service` | `pnpm -C apps/negotiation-service dev` |
| `contracts` | `cd contracts && forge test` |

## Full test suite

```bash
pnpm -r typecheck                                     # 0 errors across all TS
pnpm -C packages/crypto test                          # 4 crypto unit tests
pnpm -C apps/negotiation-service test                 # 64 service tests
pnpm -C apps/web test                                 # 46 web tests
cd contracts && forge test                            # 35 Solidity tests
node scripts/verify-attestation.mjs \
  --file scripts/fixtures/sample-attestation.json    # verifier smoke test (~4 checks)
# Total: ~153 tests
```

## Demo-day checklist (V3)

Before the 2-phone live demo:

1. **Deploy contracts to Hoodi** — set `DEPLOYER_PRIVATE_KEY` in env (gasless down, paid-gas flags required per org announcement):
   ```bash
   cd contracts
   forge script script/Deploy.s.sol \
     --with-gas-price 200gwei \
     --priority-gas-price 100gwei \
     --slow \
     --rpc-url https://public.hoodi.rpc.status.network \
     --broadcast --private-key $DEPLOYER_PRIVATE_KEY
   ```
   Copy printed addresses into `packages/shared/src/addresses.ts` and `docs/deployments.md`.

2. **Generate service keypair** — derive `SERVICE_DECRYPT_SK` (X25519 private key) and set it in the service env. The corresponding public key is served by `GET /service-pubkey`.

3. **Fund relayer wallet** — the `RELAYER_PRIVATE_KEY` address needs Hoodi ETH to call `settleNegotiation`. Use the Hoodi faucet.

4. **Set NEAR AI API key** — obtain from [near.ai](https://near.ai). Test with:
   ```bash
   curl https://cloud-api.near.ai/v1/models \
     -H "Authorization: Bearer $NEAR_AI_API_KEY"
   ```

5. **Rehearse twice with 2 phones** — seller lists (sealed floor), buyer offers (sealed ceiling), watch negotiation resolve in under 15s, verify `AttestationViewer` shows hash + explorer link.

6. **Judge verifier path** — hand `verify-attestation.mjs` to a teammate. They should be able to verify a settled deal in under 2 min:
   ```bash
   node scripts/verify-attestation.mjs --dealId 0x<settled-deal-id>
   ```

7. **Close DevTools on demo phones** — reservation prices are sealed before they leave the browser; they do not appear in plain form in network requests.

8. **Prep backup video** — record a full run; play if stage Wi-Fi fails.

## Attestation verification (for judges)

```bash
node scripts/verify-attestation.mjs --dealId 0x<bytes32-deal-id>
# Or with a local file:
node scripts/verify-attestation.mjs --file ./attestation.json
```

Checks: on-chain hash match → nonce binding → ECDSA signature → NVIDIA NRAS → Intel TDX quote → outputs `{ verdict: "PASS" }`.

See [docs/attestation-verification.md](./docs/attestation-verification.md) for full instructions.
See [docs/threat-model.md](./docs/threat-model.md) for the V3 trust model and residual risks.
