# @bargo/web — Next.js PWA

## Dev

```bash
pnpm -C apps/web dev         # :3000, hot reload
pnpm -C apps/web typecheck   # tsc --noEmit
pnpm -C apps/web test        # vitest (46 tests)
pnpm -C apps/web build       # production build
```

## Requirements

- **negotiation-service** must be running (`pnpm -C apps/negotiation-service dev`)
- NEAR AI API key must be set on the service side (`NEAR_AI_API_KEY`)
- `SERVICE_DECRYPT_SK` must be set on the service side (X25519 private key)
- Hoodi wallet (MetaMask) connected to chain 374

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_NEGOTIATION_SERVICE_URL` | No | Negotiation service base URL. Default: `http://localhost:3001` |
| `NEXT_PUBLIC_HOODI_RPC_URL` | No | Override Hoodi RPC. Default: `https://public.hoodi.rpc.status.network` |

## V3 seal flow

Before submitting a listing or offer, the web client:

1. Calls `GET /service-pubkey` to fetch the service's X25519 public key.
2. Generates an ephemeral X25519 keypair client-side.
3. Performs X25519 ECDH between the ephemeral private key and the service pubkey, then derives a symmetric key via HKDF-SHA256.
4. Encrypts each reservation value (floor price as wei decimal string, natural-language conditions) with XChaCha20-Poly1305, producing an `EncryptedBlob` envelope (`{ v, ephPub, nonce, ct }`).
5. Sends only the sealed blobs to the service — reservation prices and raw conditions never travel as plaintext over the wire.

Standing Intent sealing follows the same pattern, using the fixed intent AAD (`keccak256("bargo-intent-v1")`) instead of a listing-bound AAD.

## Standing Intents UI

Buyers can register a one-time sealed standing intent from the `/intents/new` page. They set a budget ceiling (sealed), natural-language conditions (sealed), optional public category and Karma tier filters, and an expiry date. The background matchmaker on the service evaluates each new listing against the intent and creates a match notification when the score is `match` or `likely`. The `/intents` page polls `GET /intent-matches` and shows new matches with the listing metadata and a public match reason (never the buyer's raw conditions). Each notification can be acknowledged to dismiss it.

## Demo steps

1. Open `/listings/new` — enter title, floor price (sealed), natural-language conditions (sealed).
2. Submit → redirects to `/listings/:id`.
3. Open `/offers/new/:listingId` on a second browser profile — enter bid ceiling (sealed), conditions (sealed).
4. Submit → redirects to `/deals/:id`.
5. `/deals/:id` polls status, shows bot-vs-bot animation → agreement (NEAR AI qwen3-30b in TEE, under 15s).
6. `AttestationViewer` shows: model ID, attestation hash, hoodiscan.status.network explorer link, verify script.
7. Click "Lock escrow" — buyer's wallet locks the agreed price on-chain.
8. After the in-person handoff, buyer clicks "Confirm meetup & release funds" → single tx releases escrow to seller → confetti + "Deal complete".

## Architecture

```
app/page.tsx              — landing (RSC)
app/listings/page.tsx     — listings list (RSC, falls back to demo fixtures)
app/listings/new/page.tsx — seller form (client — seals floor + conditions before POST)
app/listings/[id]/page.tsx — detail (client, useListing)
app/offers/new/[listingId]/page.tsx — buyer form (client — seals ceiling + conditions before POST)
app/deals/[id]/page.tsx   — negotiation status + meetup (client)
app/intents/new/page.tsx  — standing intent form (client — seals budget + conditions)
app/intents/page.tsx      — intent match notifications (client, polls /intent-matches)

lib/wagmi.ts    — wagmi config, Hoodi chain
lib/api.ts      — React Query hooks for all REST endpoints (sealed DTOs)
lib/seal.ts     — X25519 ECDH + HKDF + XChaCha20-Poly1305 client-side sealing
lib/rln.ts      — RLN proof stub (nullifier-compatible with real Status Network SDK)
lib/format.ts   — KRW formatter, address truncate
lib/utils.ts    — cn() tailwind-merge helper
```

## Privacy model (UI copy)

The app truthfully communicates the V3 trust model:
- "Your reservation price and conditions are encrypted in your browser before leaving this page."
- "The service handles only ciphertext at rest. Plaintext exists inside the service for approximately 10ms while packaging the NEAR AI prompt."
- Counterparties never see each other's reservation price or raw conditions.
- See [docs/threat-model.md](../../docs/threat-model.md) for the full 10-row threat table.

## Demo checklist

- [ ] Service running with `SERVICE_DECRYPT_SK`, `NEAR_AI_API_KEY`, and `RELAYER_PRIVATE_KEY` set.
- [ ] Contracts deployed on Hoodi; addresses set in `packages/shared/src/addresses.ts`.
- [ ] Relayer wallet funded with Hoodi ETH.
- [ ] `GET /service-pubkey` returns a 32-byte hex pubkey — confirm before demo.
- [ ] Two browser profiles open (seller + buyer), both connected to Hoodi chain 374.
- [ ] DevTools closed on demo phones — reservation prices are sealed in the browser; no plaintext appears in network requests, but the EncryptedBlob fields are visible in network tab.
