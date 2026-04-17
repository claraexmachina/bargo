# Bargo

> NEAR AI TEE × Status Network — P2P 중고거래 협상 자동화

**Status: V2 demo-ready (NEAR AI TEE + Status Network Hoodi gasless)**

AI 봇이 양측 reservation price·자연어 조건을 비공개로 협상합니다. 협상은 NEAR AI Cloud (Intel TDX + NVIDIA GPU TEE) 안에서 이루어지며 심사위원이 직접 검증할 수 있습니다.

- [PRD](./PRD.md) — 문제 정의, 유저 스토리, 데모 시나리오 (§2.12)
- [PLAN_V2.md](./PLAN_V2.md) — V2 아키텍처, 공유 타입, 파일 소유권, 단계 게이트
- [Threat model](./docs/threat-model.md) — V2 정직한 신뢰 모델 (10행 위협 테이블)
- [Attestation verification](./docs/attestation-verification.md) — 심사위원 검증 가이드

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

**신뢰 모델 요약**: 운영자는 협상 ~15초간 plaintext를 보며, 거래 완료 즉시 DB에서 자동 삭제됩니다. NEAR AI TEE의 LLM 추론은 심사위원이 `verify-attestation.mjs`로 독립 검증 가능합니다.

**Gasless 상태**: Status Network Hoodi의 RLN prover 버그로 현재 gasless 일시 중단 (주최측 공지). 앱은 `linea_estimateGas`를 통합하여 **gasless-ready** — 수정 반영 시 자동으로 gasless 동작. 그 전까지는 유료 가스.

## Quick start

```bash
# Prerequisites: pnpm 9, Node 20+, Foundry
pnpm install
cp .env.example .env.local   # 아래 환경변수 참고
```

```bash
# Terminal 1 — negotiation service (NEAR AI API key 필요)
cd apps/negotiation-service && pnpm dev

# Terminal 2 — web
cd apps/web && pnpm dev
```

Open http://localhost:3000 → 지갑 연결 (Hoodi chainId 374) → 매물 등록 → 오퍼 제출 → 봇 vs 봇 협상 → 합의 결과 확인

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
pnpm -C apps/web test      # 28 web tests
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
