# Haggle

> TEE-mediated P2P negotiation — agents negotiate price and meetup conditions so you don't have to.

**Status: demo-ready (hackathon).** All unit + integration tests green (122). Contracts + service + web + TEE wired end-to-end against a mock TEE. Real TEE and on-chain deploy pending a private key.

- [PRD](./PRD.md) — problem statement, user stories, demo scenario (§2.12)
- [PLAN](./PLAN.md) — architecture, shared types, file ownership, phase gates
- [UX review](./docs/ux-review.md) — mobile + privacy audit (all blockers resolved)
- [QA report](./docs/qa-report.md) — 119 tests + 10 scenarios + privacy grep
- [Deployment guide](./docs/deployments.md) — Hoodi (374) + TEE signer whitelist

## Quick start

```bash
# Prerequisites: pnpm 9, Node 20+, Foundry, Python 3.12, uv
pnpm install
cp .env.example .env.local   # fill in your values
```

Run the full stack locally with the mock TEE:

```bash
# Terminal 1 — service with mock TEE
cd apps/negotiation-service && MOCK_TEE=1 pnpm dev

# Terminal 2 — web
cd apps/web && pnpm dev
```

Open http://localhost:3000 → connect wallet (Hoodi chainId 374) → list a 맥북 → offer from a second browser profile → watch the bot-vs-bot negotiation resolve.

### Per-package commands

| Package / App | Command |
|---|---|
| `packages/shared` | `pnpm -C packages/shared typecheck` |
| `packages/crypto` | `pnpm -C packages/crypto test` |
| `apps/web` | `pnpm -C apps/web dev` |
| `apps/negotiation-service` | `pnpm -C apps/negotiation-service dev` |
| `contracts` | `cd contracts && forge test` |
| `services/tee` | `cd services/tee && uv run uvicorn haggle_tee.server:app --reload` |

### Full test suite

```bash
pnpm -r typecheck          # 0 errors across all TS
pnpm -r test               # 52 TS tests (crypto 5 + service 25 + web 22)
cd contracts && forge test # 34 Solidity tests
cd services/tee && .venv/bin/python -m pytest  # 36 Python tests
```

## Demo-day checklist

Before the 2-phone live demo:

1. **Deploy contracts to Hoodi** — set `DEPLOYER_PRIVATE_KEY` and `ENCLAVE_SIGNER_ADDRESS` in env, then:
   ```bash
   cd contracts
   forge script script/Deploy.s.sol --rpc-url https://public.hoodi.rpc.status.network --broadcast --private-key $DEPLOYER_PRIVATE_KEY
   forge script script/Seed.s.sol   --rpc-url https://public.hoodi.rpc.status.network --broadcast --private-key $DEPLOYER_PRIVATE_KEY
   ```
   Copy the printed addresses into `packages/shared/src/addresses.ts` and `docs/deployments.md`.
2. **Deploy TEE** (NEAR AI Cloud) — see `services/tee/README.md`. Inject `TEE_SIGNER_PK` inside the enclave; publish the derived address so contract-lead can call `addEnclaveSigner`.
3. **Update demo wallets** — Seed.s.sol seeds Alice/Bob/Eve Karma tiers. Use the same wallets on both phones during filming.
4. **Rehearse twice**: once for timing, once for camera framing. Verify both phones show the 5-second condition-mismatch → retry → agreement flow (PRD §2.12).
5. **Close all DevTools on demo phones** — reservation prices are masked in UI but visible in React DevTools until the form submits.
6. **Prep backup video** — record a real run in advance; play it if stage Wi-Fi fails.

## Architecture

```
Web (Next.js PWA) ──┬─► Negotiation Service (Fastify + SQLite) ─► TEE (NEAR AI Cloud, Python)
                    │                                               │
                    └─► Status Network Hoodi ◄──────────────────────┘
                        (HaggleEscrow, KarmaReader, RLNVerifier)
```

- Reservation prices and raw natural-language conditions are sealed client-side (X25519 + XChaCha20-Poly1305) with TEE's pubkey.
- TEE runs an LLM (NEAR AI Cloud Llama 3.1) to parse conditions, matches them, computes ZOPA price weighted by Karma tier, and signs an EIP-712 attestation with a secp256k1 key.
- `HaggleEscrow.settleNegotiation` verifies the signature + enclave whitelist + attestation hash before accepting the deal.
- Karma tier throughput + high-value gating + RLN rate-limit are enforced on-chain.

See [PLAN §3](./PLAN.md) for the full contract, REST, and envelope specs.

## Environment reference

Top-level `.env.example` is grouped by service (SHARED / WEB / NEGOTIATION_SERVICE / TEE / CONTRACTS). Copy to `.env.local` and fill in.

Mock mode (no TEE or contracts needed):
```
MOCK_TEE=1
NEXT_PUBLIC_NEGOTIATION_SERVICE_URL=http://localhost:3001
```
