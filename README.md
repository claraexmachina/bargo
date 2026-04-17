# Bargo

> NEAR AI TEE × Status Network — P2P negotiation automation

**Status: V2 demo-ready (NEAR AI TEE + Status Network Hoodi gasless)**

AI bots negotiate both sides' reservation prices and natural-language conditions privately. Negotiation runs inside NEAR AI Cloud (Intel TDX + NVIDIA GPU TEE) and can be independently verified by judges.

- [PRD](./PRD.md) — problem definition, user stories, demo scenario (§2.12)
- [PLAN_V2.md](./PLAN_V2.md) — V2 architecture, shared types, file ownership, phase gates
- [Threat model](./docs/threat-model.md) — V2 honest trust model (10-row threat table)
- [Attestation verification](./docs/attestation-verification.md) — judge verification guide

## Architecture

```
Web (Next.js PWA) ──► Negotiation Service (Fastify + SQLite)
                              │
                    ┌─────────▼─────────────────────────┐
                    │  NEAR AI Cloud (Intel TDX + GPU)  │
                    │  qwen3-30b LLM, /v1/attestation   │
                    └─────────┬─────────────────────────┘
                              │ nearAiAttestationHash
                    ┌─────────▼─────────────────────────┐
                    │  Relayer (chain/relayer.ts)        │
                    │  settleNegotiation() → Hoodi       │
                    └─────────┬─────────────────────────┘
                              │
                    ┌─────────▼─────────────────────────┐
                    │  Status Network Hoodi              │
                    │  BargoEscrow, KarmaReader,        │
                    │  RLNVerifier                       │
                    └────────────────────────────────────┘
```

**Trust model summary**: Operator sees plaintext for ~15s during negotiation; auto-purged from DB on deal completion. NEAR AI TEE LLM inference can be independently verified by judges via `verify-attestation.mjs`.

**Gasless status**: Gasless is temporarily suspended on Status Network Hoodi due to an RLN prover bug (announced by the organiser). The app integrates `linea_estimateGas` and is **gasless-ready** — will switch automatically once the fix ships. Until then, paid gas is used.

## Quick start

```bash
# Prerequisites: pnpm 9, Node 20+, Foundry
pnpm install
cp .env.example .env.local   # see environment variables below
```

```bash
# Terminal 1 — negotiation service (requires NEAR AI API key)
cd apps/negotiation-service && pnpm dev

# Terminal 2 — web
cd apps/web && pnpm dev
```

Open http://localhost:3000 → Connect wallet (Hoodi chainId 374) → Create listing → Submit offer → Bot vs bot negotiation → View agreement result

## Environment variables

```bash
# NEAR AI
NEAR_AI_API_KEY=your_near_ai_api_key
NEAR_AI_MODEL=qwen3-30b              # default

# Relayer (service signs+sends settleNegotiation tx)
RELAYER_PRIVATE_KEY=0x...
ATTESTATION_RELAYER_ADDRESS=0x...    # derived from RELAYER_PRIVATE_KEY

# Contracts (Hoodi chain 374)
BARGO_ESCROW_ADDRESS=0x...
KARMA_READER_ADDRESS=0x...
RLN_VERIFIER_ADDRESS=0x...

# Web
NEXT_PUBLIC_NEGOTIATION_SERVICE_URL=http://localhost:3001
NEXT_PUBLIC_RPC_URL=https://public.hoodi.rpc.status.network

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
pnpm -r typecheck          # 0 errors across all TS
pnpm -C apps/web test      # web tests
pnpm -C apps/negotiation-service test  # 34 service tests
cd contracts && forge test # 34 Solidity tests
node scripts/verify-attestation.mjs --file scripts/fixtures/sample-attestation.json  # verifier smoke test
# Total: ~100 tests
```

## Demo-day checklist (V2)

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

2. **Fund relayer wallet** — the `RELAYER_PRIVATE_KEY` address needs Hoodi ETH to call `settleNegotiation`. Use the Hoodi faucet.

3. **Set NEAR AI API key** — obtain from [near.ai](https://near.ai). Test with:
   ```bash
   curl https://cloud-api.near.ai/v1/models \
     -H "Authorization: Bearer $NEAR_AI_API_KEY"
   ```

4. **Rehearse twice with 2 phones** — seller lists, buyer offers, watch negotiation resolve in ≤15s, verify `AttestationViewer` shows hash + explorer link.

5. **Judge verifier path** — hand `verify-attestation.mjs` to a teammate. They should be able to verify a settled deal in ≤2 min:
   ```bash
   node scripts/verify-attestation.mjs --dealId 0x<settled-deal-id>
   ```

6. **Close DevTools on demo phones** — reservation prices are masked in UI but visible in React DevTools before form submits.

7. **Prep backup video** — record a full run; play if stage Wi-Fi fails.

## Attestation verification (for judges)

```bash
node scripts/verify-attestation.mjs --dealId 0x<bytes32-deal-id>
# Or with a local file:
node scripts/verify-attestation.mjs --file ./attestation.json
```

Checks: on-chain hash match → nonce binding → ECDSA signature → NVIDIA NRAS → Intel TDX quote → outputs `{ verdict: "PASS" }`.

See [docs/attestation-verification.md](./docs/attestation-verification.md) for full instructions.
