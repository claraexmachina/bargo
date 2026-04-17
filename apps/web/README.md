# @bargo/web — Next.js PWA

## Dev

```bash
pnpm -C apps/web dev         # :3000, hot reload
pnpm -C apps/web typecheck   # tsc --noEmit
pnpm -C apps/web test        # vitest (28 tests)
pnpm -C apps/web build       # production build
```

## Requirements

- **negotiation-service** must be running (`pnpm -C apps/negotiation-service dev`)
- NEAR AI API key must be set on the service side (`NEAR_AI_API_KEY`)
- Hoodi wallet (MetaMask) connected to chain 374

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_NEGOTIATION_SERVICE_URL` | No | Negotiation service base URL. Default: `http://localhost:3001` |
| `NEXT_PUBLIC_RPC_URL` | No | Override Hoodi RPC. Default: `https://public.hoodi.rpc.status.network` |

There is no `NEXT_PUBLIC_MOCK_TEE_PUBKEY` — V2 uses NEAR AI Cloud (no client-side encryption, no mock TEE).

## Demo steps

1. Open `/listings/new` — enter title, ask price e.g. 800,000, min price e.g. 700,000, natural-language conditions
2. Submit → redirects to `/listings/:id`
3. Open `/offers/new/:listingId` on a second browser profile — enter bid e.g. 720,000, max e.g. 750,000
4. Submit → redirects to `/deals/:id`
5. `/deals/:id` polls status, shows bot-vs-bot animation → agreement (NEAR AI qwen3-30b in TEE)
6. `AttestationViewer` shows: model ID, attestation hash, hoodiscan.status.network explorer link, "Verify" script
7. Click "에스크로 락업" → meetup QR flow
8. Paste other party's QR → confetti

## Architecture

```
app/page.tsx              — landing (RSC)
app/listings/page.tsx     — listings list (RSC, falls back to demo fixtures)
app/listings/new/page.tsx — seller form (client)
app/listings/[id]/page.tsx — detail (client, useListing)
app/offers/new/[listingId]/page.tsx — buyer form (client)
app/deals/[id]/page.tsx   — negotiation status + meetup (client)

lib/wagmi.ts    — wagmi config, Hoodi chain
lib/api.ts      — React Query hooks for all 5 REST endpoints (plaintext DTOs)
lib/rln.ts      — RLN proof stub (nullifier-compatible with real SDK)
lib/format.ts   — KRW formatter, address truncate
lib/utils.ts    — cn() tailwind-merge helper
```

**Note:** `lib/encrypt.ts` does not exist in V2. All reservation data is sent as plaintext over HTTPS. The service is the trusted broker and auto-purges plaintext on settlement.

## Privacy model (UI copy)

The app truthfully communicates the V2 trust model:
- "NEAR AI TEE 안에서 LLM이 처리합니다. 운영자는 합의 중 ~15초간만 보며 거래 완료 즉시 자동 삭제합니다."
- Counterparties never see each other's reservation price or raw conditions.
- See `docs/threat-model.md` for the full 10-row threat table.
