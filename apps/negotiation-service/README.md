# @haggle/negotiation-service

Thin Node.js HTTP service that orchestrates off-chain encrypted negotiation blobs, RLN proof verification, and TEE (Trusted Execution Environment) request routing for the Haggle P2P marketplace.

## Architecture

```
PWA (apps/web)
    │  REST (5 endpoints)
    ▼
negotiation-service          ← YOU ARE HERE
    │
    ├── SQLite (better-sqlite3, WAL mode)
    │     listing / offer / negotiation / rln_nullifiers
    │
    ├── RLN verify (src/rln/verify.ts)
    │     nullifier dedup + epoch rate-limit (max 3/epoch)
    │
    ├── Chain read (src/chain/read.ts, viem)
    │     getTier / canOffer / activeNegotiations  ← read-only Hoodi
    │
    └── TEE client (src/tee/client.ts OR src/tee/mock.ts)
             │  POST /negotiate
             ▼
         services/tee  (NEAR AI Cloud TEE — Python)
         OR mock in-process (MOCK_TEE=1)
```

### On-chain write responsibility

The service does NOT submit transactions. All on-chain writes happen from the user's wallet via wagmi/viem in `apps/web`:
- `registerListing()` — called by seller after `POST /listing` returns `listingId`
- `submitOffer()` — called by buyer after `POST /offer` returns `offerId`
- `settleNegotiation()` — called by either party after polling `/status` yields `agreement`
- `confirmMeetup()` / `reportNoShow()` — called from the meetup QR confirmation screen

Once a tx confirms, the frontend calls `POST /attestation-receipt` to record the `onchainTxHash` in the service.

## REST API

| Method | Path | Response | Notes |
|--------|------|----------|-------|
| POST | `/listing` | 201 `{ listingId, onchainTxHash: null }` | Stores encrypted blobs; no plaintext |
| POST | `/offer` | 202 `{ offerId, negotiationId, status:'queued' }` | Fires TEE async; poll /status |
| GET | `/status/:negotiationId` | 200 `GetStatusResponse` | States: queued→running→agreement/fail→settled |
| POST | `/attestation-receipt` | 200 `{ ok: true }` | Verify EIP-191 sig; record onchain hash |
| GET | `/tee-pubkey` | 200 `GetTeePubkeyResponse` | Cached 60s |

## Environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `PORT` | no | 3001 | HTTP listen port |
| `TEE_URL` | if not MOCK_TEE | — | NEAR AI Cloud TEE HTTPS base URL |
| `MOCK_TEE` | no | — | Set to `1` to use in-process mock TEE |
| `MOCK_TEE_SK` | if MOCK_TEE=1 | — | X25519 privkey for mock decryption (DEMO ONLY) |
| `MOCK_TEE_SIGNER_SK` | if MOCK_TEE=1 | — | secp256k1 privkey for mock attestation signing (DEMO ONLY) |
| `HOODI_RPC_URL` | no | public Hoodi RPC | Status Network Hoodi testnet RPC |
| `HAGGLE_ESCROW_ADDRESS` | no | 0x000... | HaggleEscrow contract address |
| `KARMA_READER_ADDRESS` | no | 0x000... | KarmaReader contract address |
| `RLN_VERIFIER_ADDRESS` | no | 0x000... | RLNVerifier contract address |
| `DB_PATH` | no | `./data/haggle.db` | SQLite file path |

## Run dev

```bash
# From repo root
pnpm install

# Start with mock TEE (no NEAR AI Cloud needed)
cd apps/negotiation-service
cp .env.example .env
pnpm dev
```

## Run tests

```bash
cd apps/negotiation-service
pnpm test
```

Or from repo root:
```bash
pnpm -C apps/negotiation-service test
```

## Build

```bash
pnpm build    # tsc → dist/
pnpm start    # node dist/index.js
```

## Typecheck + lint

```bash
pnpm typecheck
pnpm lint
```

## How MOCK_TEE works

When `MOCK_TEE=1`:
1. `GET /tee-pubkey` returns the X25519 pubkey derived from `MOCK_TEE_SK`.
2. Frontend encrypts `min_sell` / `max_buy` / conditions to this pubkey.
3. `POST /offer` triggers `createMockTeeClient` which:
   - Decrypts `encMinSell` and `encMaxBuy` using `MOCK_TEE_SK`
   - If `maxBuy >= minSell` → returns `agreement` at midpoint price
   - Else → returns `fail` with `reasonHash = keccak256("no_price_zopa")`
   - Fixed `agreedConditions`: `{ location:"gangnam", meetTimeIso:"2026-04-20T19:00:00+09:00", payment:"cash" }`
   - Signs attestation with `MOCK_TEE_SIGNER_SK` (secp256k1 EIP-191)

The mock `enclaveId` (`0xDEADBEEF...`) must be removed from `ENCLAVE_SIGNERS` before any production deploy (enforced in `contracts/script/Deploy.s.sol`).

## RLN stub

RLN proof verification is a stub (no real ZK circuit). The stub:
- Accepts any structurally valid proof (non-zero nullifier, positive epoch, non-empty proof bytes)
- Enforces `RLN_MAX_PER_EPOCH = 3` via the `rln_nullifiers` SQLite table
- Tracks per `(nullifier, epoch)` count atomically

When Status SDK is available, set `RLN_SDK=1` and swap in the real verifier in `src/rln/verify.ts` (marked with TODO).

## Logging

All logs are JSON (pino). `enc*` fields and `rlnProof.proof` are **redacted** from all log output — never logged in plaintext.
