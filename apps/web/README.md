# @haggle/web — Next.js PWA

## Dev

```bash
pnpm -C apps/web dev         # :3000, hot reload
pnpm -C apps/web typecheck   # tsc --noEmit
pnpm -C apps/web test        # vitest
pnpm -C apps/web build       # production build
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_NEGOTIATION_SERVICE_URL` | No | Negotiation service base URL. Default: `http://localhost:3001` |
| `NEXT_PUBLIC_MOCK_TEE_PUBKEY` | No | Fallback X25519 pubkey (hex) used when `/tee-pubkey` is unreachable. Set from `.env.example` for local dev. |
| `NEXT_PUBLIC_RPC_URL` | No | Override Hoodi RPC. Default: `https://public.hoodi.rpc.status.network` |

## Demo checklist

- [ ] Wallet (MetaMask) connected to Hoodi (chain 374)
- [ ] `NEXT_PUBLIC_NEGOTIATION_SERVICE_URL` set to running negotiation service
- [ ] `NEXT_PUBLIC_MOCK_TEE_PUBKEY` set for dev (from `.env.example`)
- [ ] Listing create → offer → deals/:id flow without any price leak in DOM (verified by test)

## Mock flow (MOCK_TEE=1)

1. Open `/listings/new` — enter title, ask price e.g. 800000, min price e.g. 700000, conditions
2. Submit → redirects to `/listings/:id`
3. Open `/offers/new/:listingId` — enter bid e.g. 720000, max e.g. 750000
4. Submit → redirects to `/deals/:id`
5. `/deals/:id` polls status, shows bot-vs-bot animation → agreement (mock TEE mid-price: 725000)
6. Click "에스크로 락업" → shows meetup QR flow
7. "만남 QR 생성하기" → sign → QR appears
8. Paste other party's QR → confetti 🎊

## Gasless status

Standard RPC is wired to Hoodi. Status Network gasless relayer endpoint is not yet confirmed.
When available, update `lib/wagmi.ts` transport with the relayer URL and document here.

## Listings page data source

`GET /listings` is not yet exposed by the negotiation service.
The page currently shows demo fixture data (3 listings).
Issue opened: service-lead should add `GET /listings` returning `ListingPublic[]`.
Real chain event read (via viem `getLogs`) is the fallback plan if service endpoint is not ready.

## Architecture

```
app/page.tsx              — landing (RSC)
app/listings/page.tsx     — listings list (RSC, demo fixtures)
app/listings/new/page.tsx — seller form (client)
app/listings/[id]/page.tsx — detail (client, useListing)
app/offers/new/[listingId]/page.tsx — buyer form (client)
app/deals/[id]/page.tsx   — negotiation status + meetup (client)

lib/wagmi.ts    — wagmi config, Hoodi chain
lib/api.ts      — React Query hooks for all 5 REST endpoints
lib/encrypt.ts  — wraps @haggle/crypto seal() for price + conditions
lib/rln.ts      — RLN proof stub (nullifier-compatible with real SDK)
lib/format.ts   — KRW formatter, address truncate
lib/utils.ts    — cn() tailwind-merge helper
```
