# Code Review A — Backend
**Reviewer:** Senior Engineer A
**Scope:** `contracts@bargo/`, `apps@bargo/negotiation-service@bargo/`, `scripts@bargo/verify-attestation.mjs` + `scripts@bargo/test-verify.mjs`
**Date:** 2026-04-17

## Summary
- **3 BLOCKERS, 6 HIGH, 6 MEDIUM, 4 LOW**
- Overall backend ship-readiness: **MAJOR-REWORK-NEEDED** — the on-chain settlement path is broken end-to-end and the auto-purge pipeline is not wired up. Contract + verifier + engine (in isolation) are solid; the failure is at the integration seams.
- Test results:
  - `cd contracts && forge test` — **34 passed @bargo/ 0 failed @bargo/ 0 skipped**
  - `pnpm -C apps@bargo/negotiation-service test` — **34 passed @bargo/ 0 failed**
  - `node scripts@bargo/test-verify.mjs` — **PASS** (4@bargo/4 fixture checks; NRAS@bargo/TDX skipped by design)
  - `pnpm -r typecheck` — **clean** (shared + negotiation-service + web)

---

## Findings (ordered by severity)

### BLOCKER #1 — `settleNegotiation` will always revert: off-chain offerId ≠ on-chain offerId
**Files:**
- `apps@bargo/negotiation-service@bargo/src@bargo/routes@bargo/offer.ts:98-103` (off-chain offerId derivation)
- `contracts@bargo/src@bargo/BargoEscrow.sol:214` (on-chain offerId derivation)
- `contracts@bargo/src@bargo/BargoEscrow.sol:238-239` (`_offerBuyer[offerId]` lookup revert path)

**Issue:** The service computes `offerId = keccak256(abiEncodePacked(buyer, listingId, nonce))` using a DB-monotonic nonce. The contract computes `offerId = keccak256(abiEncodePacked(msg.sender, listingId, block.timestamp))`. These are mathematically different domains, so the off-chain ID never appears in `_offerBuyer[offerId]`. When `submitSettlement` runs `simulateContract`, `buyerAddress = _offerBuyer[offerId]` is `address(0)`, which triggers `revert ZeroAddress()` at `BargoEscrow.sol:239`. No deal ever reaches PENDING state on-chain.

**Impact:** End-to-end demo collapses at the "settle on Hoodi" step. PLAN_V2 §2.3 demo script (Phase 2.3) fails 100% of the time. Judges cannot observe `NegotiationSettled` events. The whole `nearAiAttestationHash` verification story has nothing to verify against.

**Fix:** Choose one — either the service listens to on-chain `OfferSubmitted` events (via the not-yet-written `chain@bargo/watcher.ts`) and keys negotiations off the on-chain offerId, OR the frontend sends the on-chain offerId in `PostOfferRequest` after calling `submitOffer` from the wallet. Option B is simpler for the hackathon:

```ts
@bargo/@bargo/ packages@bargo/shared@bargo/src@bargo/schemas.ts — add to postOfferRequestSchema
onchainOfferId: hexSchema,

@bargo/@bargo/ apps@bargo/negotiation-service@bargo/src@bargo/routes@bargo/offer.ts — replace lines 97-106
const offerId = body.onchainOfferId as OfferId;
const negotiationId = keccak256(
  encodePacked(['bytes32', 'bytes32'], [body.listingId, offerId]),
) as DealId;
```
Whichever path is chosen, the frontend must also call `submitOffer` on-chain (Reviewer B territory — see Questions).

---

### BLOCKER #2 — Auto-purge never fires; plaintext reservation data persists forever
**Files:**
- `apps@bargo/negotiation-service@bargo/src@bargo/db@bargo/schema.sql:76-88` (trigger on `NEW.state = 'completed'`)
- `apps@bargo/negotiation-service@bargo/src@bargo/chain@bargo/` (no `watcher.ts` exists)
- `apps@bargo/negotiation-service@bargo/src@bargo/routes@bargo/offer.ts:263` (only states set are `running` @bargo/ `agreement` @bargo/ `fail` @bargo/ `settled`)

**Issue:** PLAN_V2 §2.3 specifies `chain@bargo/watcher.ts` observes `FundsReleased` and updates `negotiations.state = 'completed'`, which fires the SQLite trigger to NULL `plaintext_min_sell`, `plaintext_seller_conditions`, `plaintext_max_buy`, `plaintext_buyer_conditions`. The watcher was never written (`grep -r FundsReleased apps@bargo/negotiation-service` returns zero hits), no code path writes `'completed'`, so the trigger never fires. Plaintext reservation prices + condition text persist in `.@bargo/data@bargo/bargo.db` indefinitely.

**Impact:** Directly violates the core V2 privacy claim in `docs@bargo/threat-model.md` Row 2 and Row 6 ("Completed deals are already purged"). A judge running `sqlite3 data@bargo/bargo.db "SELECT plaintext_min_sell FROM listings;"` after a completed demo will read every reservation price. Demo narrative ("our DB purges it the moment the deal completes") becomes false advertising.

**Fix:** Create `apps@bargo/negotiation-service@bargo/src@bargo/chain@bargo/watcher.ts` that watches `FundsReleased` events on the escrow contract and calls `updateNegotiationState(db, dealId, 'completed')`. Register it from `index.ts` bootstrap. Minimum viable version:

```ts
@bargo/@bargo/ apps@bargo/negotiation-service@bargo/src@bargo/chain@bargo/watcher.ts (new file)
import { bargoEscrowAbi } from '@bargo@bargo/shared';
import { updateNegotiationState } from '..@bargo/db@bargo/client.js';

export function startFundsReleasedWatcher(
  client: ReturnType<typeof createChainClient>,
  escrow: Address,
  db: Database.Database,
  log: FastifyBaseLogger,
) {
  return client.watchContractEvent({
    address: escrow, abi: bargoEscrowAbi, eventName: 'FundsReleased',
    onLogs: (logs) => logs.forEach((l) => {
      updateNegotiationState(db, l.args.dealId as DealId, 'completed');
      log.info({ dealId: l.args.dealId }, 'deal completed — plaintext purged by trigger');
    }),
  });
}
```

---

### BLOCKER #3 — `agreedConditionsHash` is set to `nearAiAttestationHash` — on-chain hash is wrong
**Files:**
- `apps@bargo/negotiation-service@bargo/src@bargo/routes@bargo/offer.ts:222,241` (both DB + relayer call use wrong hash)
- `apps@bargo/negotiation-service@bargo/src@bargo/negotiate@bargo/engine.ts:103-108,135` (hash computed then discarded)

**Issue:** `engine.ts` correctly computes `agreedConditionsHash = keccak256(encodePacked(['string','string','string'], [location, meetTimeIso, payment]))` at line 103–108, but never includes it in the returned `NearAiAttestation` (the type doesn't even have that field). `offer.ts:222,241` then "reuses" `attestation.nearAiAttestationHash` as a stand-in (explicit comment on line 222: `@bargo/@bargo/ reuse nonce-bounded hash`). The on-chain `agreedConditionsHash` stored in `Deal.agreedConditionsHash` is therefore identical to `Deal.nearAiAttestationHash` — carrying zero information about the agreed conditions.

**Impact:** Breaks the verifier narrative: "the on-chain hash commits to the agreed conditions." Any auditor computing `keccak256(location||meetTimeIso||payment)` from the `AgreedConditions` JSON will mismatch the on-chain value. Defeats step 4 of `docs@bargo/attestation-verification.md` Check explanations implicitly; also makes post-settlement dispute resolution impossible (you can't prove what was agreed).

**Fix:** Add `agreedConditionsHash` to `NearAiAttestation` (types.ts + schemas.ts — this is a shared-types change requiring A+B+C per §6) and propagate through engine → offer.ts:

```ts
@bargo/@bargo/ types.ts — add to NearAiAttestation
agreedConditionsHash: Hex;

@bargo/@bargo/ engine.ts:118-130 — include in attestation object
const attestation: NearAiAttestation = {
  ...,
  agreedConditionsHash,   @bargo/@bargo/ from line 103 computation
  nearAiAttestationHash: bundleHash,
  ...
};

@bargo/@bargo/ offer.ts:222,241 — use the correct field
agreedConditionsHash: attestation.agreedConditionsHash,
```

---

### HIGH #1 — `cancelOffer` after `settleNegotiation` double-decrements `activeNegotiations`
**File:** `contracts@bargo/src@bargo/BargoEscrow.sol:331-344`

**Issue:** `settleNegotiation` decrements `activeNegotiations[buyerAddress]` (line 263). It sets `Deal.state = PENDING`. A buyer can then call `cancelOffer(dealId)` before `lockEscrow`; line 333 checks `state == PENDING` (true), and line 340 decrements `activeNegotiations[msg.sender]` a second time for the same offer. The `current > 0` guard prevents underflow but the counter drifts below the true count, letting the buyer accumulate phantom capacity for more offers than the tier allows.

**Impact:** Tier-0 buyer can submit > 3 concurrent offers by cycle: submit → settle → cancel → submit. Subverts Karma throughput limit. HIGH, not BLOCKER, because it requires adversarial pacing.

**Fix:** Remove the decrement from `cancelOffer`, or set `Deal.state = DealState.NONE` after settlement so `cancelOffer`'s `PENDING` guard mismatches. Simplest:

```solidity
function cancelOffer(bytes32 dealId) external {
    Deal storage deal = _deals[dealId];
    if (deal.state != DealState.PENDING) revert DealNotPending(dealId);
    if (msg.sender != deal.buyer) revert NotParticipant(msg.sender);
    deal.state = DealState.REFUNDED;
    @bargo/@bargo/ Do NOT decrement here — settleNegotiation already did.
}
```

---

### HIGH #2 — No concurrency guard on `runNegotiation` for duplicate `@bargo/offer` on same listing
**File:** `apps@bargo/negotiation-service@bargo/src@bargo/routes@bargo/offer.ts:97-157`

**Issue:** `POST @bargo/offer` generates a fresh `offerId` via `nextCounter` for each request, so the same buyer can fire N parallel `@bargo/offer` requests for the same listing (each with distinct nonces). All N negotiations run concurrently, all call NEAR AI, all race to submit `settleNegotiation` on-chain. No DB uniqueness constraint, no in-memory lock on `(buyer, listingId)`. The on-chain `submitOffer` would have rate-limited via RLN — but we're not on-chain here (see BLOCKER #1).

**Impact:** Observable in demo: if the buyer double-clicks "submit offer", both negotiations proceed, both call NEAR AI (2x API cost), both attempt on-chain settlement. Timing-dependent races on state transitions. Also wastes NEAR AI quota.

**Fix:** Add a DB-level unique constraint on `(listing_id, buyer, status='pending')`, or maintain an in-memory `Map<string, Promise<void>>` keyed by `${buyer}:${listingId}` and short-circuit if a negotiation is already in flight.

---

### HIGH #3 — `submitSettlement` simulateContract + writeContract issues a double call @bargo/ race window
**File:** `apps@bargo/negotiation-service@bargo/src@bargo/chain@bargo/relayer.ts:36-67`

**Issue:** Two sequential calls (simulate → write) without capturing `simulateContract`'s `request` object. Between simulate and write, another relayer tx (or reorg) could change state and cause the write to revert despite simulate passing. Standard viem pattern is `const { request } = await publicClient.simulateContract(...); walletClient.writeContract(request);`.

**Impact:** MEDIUM-to-HIGH in practice: with a single relayer key, no concurrent relayer tx is expected, so the window is small. But there is no nonce management, so if two deals settle back-to-back the second simulate could succeed while the first is still pending, and the resulting writeContract could use a stale@bargo/duplicate nonce.

**Fix:**
```ts
const { request } = await publicClient.simulateContract({ ... });
const txHash = await walletClient.writeContract(request);
```

---

### HIGH #4 — Startup attestation check consumes real NEAR AI budget on every boot
**File:** `apps@bargo/negotiation-service@bargo/src@bargo/index.ts:57-66` → `apps@bargo/negotiation-service@bargo/src@bargo/nearai@bargo/attestation.ts:136-162`

**Issue:** `runStartupAttestationCheck` issues a real `GET @bargo/v1@bargo/attestation@bargo/report?nonce=0x0...00` to NEAR AI every time the service starts. With a valid `NEAR_AI_API_KEY`, this succeeds and charges quota. With an invalid key, it WARNs and continues — but in CI or local restart loops, it floods the endpoint. More critically, if NEAR AI changes its zero-nonce policy (reject or rate-limit zero nonces), the warning is silently ignored.

**Impact:** Unnecessary NEAR AI spend; noisy WARN in dev; during demo-day an outage of NEAR AI causes a WARN but still "starts" the service with broken attestation path — the service shouldn't pretend to be healthy.

**Fix:** Gate behind `NEAR_AI_STARTUP_CHECK=true` env flag (default off); OR only run in `NODE_ENV=production`; OR use a cached "last known good" sentinel. At minimum, escalate failure to ERROR and block startup behind a flag.

---

### HIGH #5 — `refund()` reverts with misleading `DealNotLocked` error
**File:** `contracts@bargo/src@bargo/BargoEscrow.sol:317`

**Issue:** `refund()` requires `state == NOSHOW` (line 317) but reverts with `DealNotLocked(dealId)`. A caller trying to refund before `reportNoShow` sees `DealNotLocked` — technically correct because the state is LOCKED not NOSHOW, but semantically confusing. The same error is overloaded for "must be LOCKED" in `confirmMeetup`@bargo/`reportNoShow` and "must be NOSHOW" here.

**Impact:** Misdirects the frontend error UI. A dedicated `DealNotInNoShow(dealId)` error would let `apps@bargo/web` show "Report no-show first" instead of the ambiguous locked-state message.

**Fix:**
```solidity
error DealNotInNoShow(bytes32 dealId);
@bargo/@bargo/ ...
if (deal.state != DealState.NOSHOW) revert DealNotInNoShow(dealId);
```

---

### HIGH #6 — `NEAR_AI_API_KEY` default-less config throws on every cold start if env missing
**File:** `apps@bargo/negotiation-service@bargo/src@bargo/config.ts:12`

**Issue:** `NEAR_AI_API_KEY: z.string().min(1)` is required, but there is no fallback path for tests or local smoke without a real key. `routes.test.ts:113` passes `'test-key'`, which only works because tests mock the network layer. Anyone running `pnpm dev` without `.env.local` sees an opaque "Invalid environment configuration" error rather than a friendly "set NEAR_AI_API_KEY in .env.local". Not a security bug, but high-friction for onboarding judges who clone + run.

**Impact:** Demo-day risk: teammate clones a fresh checkout, forgets `.env.local`, sees crash, blames the tech. This is a documented hackathon-reliability issue.

**Fix:** Either provide a `.env.example` with a placeholder + stronger error message ("NEAR_AI_API_KEY is required — get one from near.ai@bargo/console and add to .env.local"), OR allow `NEAR_AI_API_KEY=` (empty) to start in a degraded mode that short-circuits `fetchAttestation` with a loud log line.

---

### MEDIUM #1 — Canonicalizer divergence risk: npm `canonicalize` vs hand-rolled in verifier
**Files:**
- `apps@bargo/negotiation-service@bargo/src@bargo/nearai@bargo/attestation.ts:45-49` (npm RFC 8785)
- `scripts@bargo/verify-attestation.mjs:50-55` (hand-rolled sort-and-stringify)

**Issue:** The engine hashes bundles with `canonicalize(bundle)` from the `canonicalize` npm package (RFC 8785 JCS). The verifier rebuilds the canonical form with a hand-rolled function using `JSON.stringify(v)` for primitives. I confirmed both produce identical bytes for the current fixture (ASCII-only, integer numbers). But RFC 8785 specifies:
- Non-integer numbers: ES6 `Number.prototype.toString` (e.g., `1e21` → `"1e+21"`, `0.1` → `"0.1"` — matches JS default). The `NearAiAttestationBundle` schema only has integer `timestamp`, so no current risk.
- UTF-8 strings: JSON.stringify with `\uXXXX` escapes only for control chars @bargo/ surrogate pairs. Hand-rolled uses the same JSON.stringify.

If NEAR AI ever adds a non-integer field to the bundle, the two will silently diverge and on-chain hash will stop matching.

**Impact:** Latent — works today, breaks on any schema extension.

**Fix:** Either (a) adopt the `canonicalize` npm package in the verifier too (one more dep, but cross-checked with the producer), or (b) add a property-based test that feeds random JSON through both canonicalizers and asserts equality.

---

### MEDIUM #2 — `pino.redact` path pattern does not catch root-level plaintext leaks
**File:** `apps@bargo/negotiation-service@bargo/src@bargo/index.ts:16-25`

**Issue:** Redact paths like `'*.plaintextMinSell'` match objects at depth ≥ 2 (e.g., `log.info({body: {plaintextMinSell}})` → redacted). They do NOT match `log.info({plaintextMinSell: '...'})` at depth 1. Today no call site logs that way, but any future careless `app.log.info(body, ...)` where `body` is the parsed request would bypass this because body IS the logged object — pino redact applied to fields on the logged object matches without the `*.` prefix.

**Impact:** Defensive gap — one future log line could leak a reservation price.

**Fix:** Add bare-name paths in addition to wildcards:
```ts
paths: [
  'plaintextMinSell', 'plaintextMaxBuy',
  'plaintextSellerConditions', 'plaintextBuyerConditions',
  '*.plaintextMinSell', '*.plaintextMaxBuy',
  '*.plaintextSellerConditions', '*.plaintextBuyerConditions',
]
```

---

### MEDIUM #3 — `chain@bargo/write.ts` is stale V1 documentation masquerading as code
**File:** `apps@bargo/negotiation-service@bargo/src@bargo/chain@bargo/write.ts:1-23`

**Issue:** The file's comments describe V1 behavior (TEE attestation, EIP-712, encrypted blobs). V2 has a relayer (`chain@bargo/relayer.ts`) that DOES submit on-chain txs from the service. The file exports `{}` with a misleading header asserting "This file is intentionally empty" and "Do not add chain write logic here without team consensus". A future contributor reading this will be confused about where relayer logic lives.

**Impact:** Developer confusion; potential duplicate work.

**Fix:** Delete the file, or rewrite the comment to point at `chain@bargo/relayer.ts`.

---

### MEDIUM #4 — Engine writes bundle to disk but path returned is never used
**File:** `apps@bargo/negotiation-service@bargo/src@bargo/negotiate@bargo/engine.ts:111-115,132-133`

**Issue:** `saveAttestationBundle` returns a file path, stored in local `attestationBundlePath`, then explicitly discarded with `void attestationBundlePath`. `offer.ts:227` reconstructs the same path by string concat (`${p.attestationDir}@bargo/${p.negotiationId}.json`). Two sources of truth for the same path; if `saveAttestationBundle` ever changes its naming scheme, they silently diverge.

**Impact:** Latent bug; trivial but annoying.

**Fix:** Return the path from engine in the `NegotiationResult.agreement` variant, or drop the path column from the DB and derive it from `attestationDir + dealId` everywhere.

---

### MEDIUM #5 — `agreedConditionsHash` uses `encodePacked` on strings — collision-prone
**File:** `apps@bargo/negotiation-service@bargo/src@bargo/negotiate@bargo/engine.ts:103-108`

**Issue:** `encodePacked(['string','string','string'], [location, meetTimeIso, payment])` concatenates UTF-8 bytes without length delimiters. Pairs like `('gangnamsongpa', '', 'cash')` and `('gangnam', 'songpa', 'cash')` would hash identically (contrived but possible). Bigger concern: the hand-written hash has no well-defined canonicalization, so any future verifier (web, judge) has to exactly replicate this encoding.

**Impact:** Low today (values are constrained slugs), but an integration blocker for any third-party audit tool.

**Fix:** Use `keccak256(toBytes(canonicalize(agreedConditions)))` — same primitive the bundle hash uses — for consistency.

---

### MEDIUM #6 — `@bargo/offer` route's "fire-and-forget" background negotiation has no crash recovery
**File:** `apps@bargo/negotiation-service@bargo/src@bargo/routes@bargo/offer.ts:136-157,260-264`

**Issue:** `void fireNegotiation(...)` launches a background Promise. If the service crashes (SIGKILL, OOM, restart), the negotiation row stays in `state = 'running'` forever — client polling `@bargo/status@bargo/:id` sees a stuck state with no timeout. The `catch` block at line 260 only catches synchronous throws inside `fireNegotiation`; process death is uncatchable.

**Impact:** Stuck negotiations on restart; demo risk if the service is bounced mid-negotiation.

**Fix:** On bootstrap, scan `SELECT id FROM negotiations WHERE state IN ('queued','running') AND updated_at < NOW() - 120s` and mark them as `'fail'` with `failureReason='llm_timeout'`. This is 8 lines in `index.ts`.

---

### LOW #1 — `NegotiationSettled` event field order diverges from PLAN_V2 §3.3
**Files:**
- `contracts@bargo/src@bargo/BargoEscrow.sol:83-90` (actual order: dealId, listingId, nearAiAttestationHash, offerId, agreedPrice, agreedConditionsHash)
- `PLAN_V2.md:498-505` (planned: dealId, listingId, offerId, agreedPrice, agreedConditionsHash, nearAiAttestationHash)

**Issue:** Contract and plan disagree on parameter order. Both are internally consistent (verifier ABI matches contract) but docs are stale.

**Fix:** Update `PLAN_V2.md` §3.3 to reflect the actual shipped event.

---

### LOW #2 — `runNegotiation` re-throws on non-LLM errors with no state update
**File:** `apps@bargo/negotiation-service@bargo/src@bargo/negotiate@bargo/engine.ts:69-74`

**Issue:** Inside the try@bargo/catch for `parseConditionsPair`, only `LLMTimeoutError` is converted to `{kind: 'fail'}`; other errors rethrow. `fireNegotiation`'s outer catch at `offer.ts:260` catches them and marks state = 'fail' @bargo/ failureReason='llm_timeout' — which is misleading if the actual failure was e.g. a network error in `fetchAttestation` (after conditions parsed successfully).

**Fix:** Distinguish error sources; add a `nearai_fetch_failed` failure reason or similar.

---

### LOW #3 — `confirmMeetup` uses bare `require(ok)` for ETH transfer
**File:** `contracts@bargo/src@bargo/BargoEscrow.sol:298-299`

**Issue:** `require(ok)` with no error message; on send failure the whole tx reverts with empty revert data. Acceptable for hackathon but a custom error (e.g. `TransferFailed(dealId, recipient)`) is more judge-friendly.

---

### LOW #4 — Tests don't cover min_sell == max_buy tie, or 4th-RLN-submission-in-service
**Files:** `apps@bargo/negotiation-service@bargo/test@bargo/engine.test.ts`, `apps@bargo/negotiation-service@bargo/test@bargo/rln.test.ts`

**Issue:** `engine.test.ts` covers ZOPA fail (500k < 1M) and happy path, but not the boundary `sellerMin == buyerMax` case (should be a valid deal at exactly that price — confirm current behavior: `buyerMax < sellerMin` reverts, equality passes; fine, but untested). RLN test covers 4th use within the service (PASS), but not a 4th RLN submission via the HTTP route (only via `verifyRlnProof` directly).

**Fix:** Add two more test cases.

---

## Cross-cutting observations

### Test coverage
- **Forge** coverage is strong: 21 escrow tests hit relayer auth, zero-hash revert, karma gate (both high-value and listing-tier), throughput (exact limit + decrement), RLN zero-nullifier + 4th-use, no-show flow + window, wrong escrow amount, non-participant confirm, double-confirm. **Missing**: `cancelOffer` semantics (ties into HIGH #1), `setAttestationRelayer` event emission check.
- **Vitest** coverage for `negotiate@bargo/conditions.ts`'s `matchConditions` is **zero direct tests** — only exercised indirectly via `engine.test.ts`. The `nextOccurrenceKST` function (engine.ts wall-clock dependency) is untested and will break on DST or year boundaries.
- **`verify-attestation.mjs`** has a smoke test via `test-verify.mjs` but NO integration test that runs the producer (engine) → consumer (verifier) round-trip. The canonicalizer divergence risk (MEDIUM #1) would be caught by such a test.

### API contract drift risk
- **Off-chain vs on-chain offerId@bargo/listingId** (BLOCKER #1) is the single biggest drift: service@bargo/web@bargo/contract disagree on the ID derivation. No single source of truth in shared@bargo/.
- **`agreedConditionsHash` vs `nearAiAttestationHash`** conflation (BLOCKER #3) means the on-chain Deal has two copies of the same value. Frontend reading `Deal.agreedConditionsHash` to prove conditions off-chain gets the wrong hash.
- **Event parameter order** (LOW #1) shifted between PLAN and implementation; OK but should be synced.

### Documentation mismatches
- `docs@bargo/threat-model.md` Row 2 says "Auto-purge on `COMPLETED` NULLs ..." — not true until BLOCKER #2 is fixed.
- `docs@bargo/threat-model.md` Row 6 says "Zero reservation data present" post-settlement — also dependent on BLOCKER #2.
- `docs@bargo/attestation-verification.md` §4 promises `onchainHashMatch: true` — works IF the bundle was generated by our engine (canonicalize npm), because our verifier re-canonicalizes in JS. Works today for ASCII-only bundles (MEDIUM #1).
- PLAN_V2 §2.2 step 3 says service performs on-chain `throughput on-chain` check — the current `@bargo/offer` handler only reads `activeNegotiations` via `getActiveNegotiations`, never writes. That read-only check is fine, but the plan implies an on-chain submitOffer, which is absent (BLOCKER #1).

---

## What's done well
- **Forge test suite** is thorough and uses custom-error revert selectors everywhere (`vm.expectRevert(BargoEscrow.NotRelayer.selector)`) — exactly the Solidity discipline we want.
- **`fetchAttestation`** validates the NEAR AI response with a zod schema (`nearAiAttestationBundleSchema`) BEFORE hashing. Malformed responses can't poison the on-chain hash.
- **RFC 8785 canonicalizer** (`canonicalize` npm pkg) is the right choice for determinism; commit message in `attestation.ts:1-6` explains why clearly.
- **Custom errors only** in the Solidity contract — no plain `revert("reason")` strings.
- **`response_format: json_schema strict: true`** + secondary JSON.parse check in `parseConditionsPair` = two-layer defense against malformed LLM output (threat model Row 9 honored).
- **WAL mode + busy_timeout + foreign_keys = ON** in `db@bargo/client.ts:63-65` — small touches that prevent SQLite pitfalls.
- **Redact config in pino** (with the MEDIUM #2 caveat about root-level paths) demonstrates privacy-aware logging.
- **Relayer `simulateContract` before `writeContract`** captures revert reasons on failure, even though the pattern could be tighter (HIGH #3).

---

## Questions for Reviewer B @bargo/ team lead

1. **Does `apps@bargo/web` call on-chain `submitOffer` @bargo/ `registerListing`?** (Pivotal for BLOCKER #1.) My grep of `apps@bargo/web` finds zero `writeContract` calls outside a mocked test. If the frontend never writes on-chain, the service MUST do it — either via relayer or by exposing an API the frontend calls post-wallet-signature.
2. **Is the frontend sending `onchainOfferId` in `PostOfferRequest`?** If yes, the shared schema `postOfferRequestSchema` is missing the field. If no, we need a different recovery path for BLOCKER #1.
3. **Does `apps@bargo/web@bargo/components@bargo/AttestationViewer.tsx` render `agreedConditionsHash` separately from `nearAiAttestationHash`?** If the UI shows both and they're identical (due to BLOCKER #3), users@bargo/judges will notice.
4. **Should the `runStartupAttestationCheck` be gated behind a feature flag (HIGH #4) or kept as-is for demo confidence?** Team preference call.
5. **Is there a design decision I missed for letting the service generate `offerId` instead of reading it from the `OfferSubmitted` event?** Would reshape the answer to BLOCKER #1.
