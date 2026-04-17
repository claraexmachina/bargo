# Code Review B — Frontend + Cross-cutting
**Reviewer:** Senior Engineer B
**Scope:** web, shared, architecture, docs, privacy
**Date:** 2026-04-17

## Summary
- **4 BLOCKERS, 8 HIGH, 7 MEDIUM, 4 LOW**
- Overall frontend + architecture ship-readiness: **WITH-FIXES** (the code paths work; docs + UI copy regress the honest V2 threat model and will hurt the judging story)
- Privacy threat model adherence (in code): **FULL**
- Privacy threat model adherence (in docs@bargo/UI copy): **REGRESSED** — multiple surfaces still tell V1's "nobody can see your floor" story

Build @bargo/ tests results:
- `pnpm -C apps@bargo/web typecheck` — PASS (0 errors)
- `pnpm -C apps@bargo/web test` — PASS (28@bargo/28)
- `pnpm -C apps@bargo/web build` — PASS (all 6 routes compile)
- `pnpm -C apps@bargo/negotiation-service test` — PASS (34@bargo/34) [cross-check with Reviewer A]
- `pnpm -C packages@bargo/shared typecheck` — PASS

---

## Findings (ordered by severity)

### BLOCKER #1 — UI copy claims operator cannot see the floor (contradicts V2 threat model)
**Files:**
- `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/apps@bargo/web@bargo/components@bargo/NegotiationStatus.tsx:66-67`
  ```
  가격·조건은 TEE 안에서만 처리됩니다 — 상대방도, 서비스도 볼 수 없습니다
  ```
- `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/apps@bargo/web@bargo/app@bargo/listings@bargo/new@bargo/page.tsx:205-207`
  ```
  이 가격은 NEAR AI TEE 안에서만 LLM에 전달됩니다.
  상대방은 볼 수 없고, 서비스는 거래 완료 후 자동 삭제합니다.
  ```
- `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/apps@bargo/web@bargo/app@bargo/offers@bargo/new@bargo/[listingId]@bargo/page.tsx:159-161` — same copy as above
- `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/apps@bargo/web@bargo/components@bargo/ConditionInput.tsx:81-82`
  ```
  이 조건은 암호화되어 TEE로 전송됩니다.
  서버·운영자도 원문을 볼 수 없습니다.
  ```
- `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/apps@bargo/web@bargo/app@bargo/page.tsx:62` — "최저가@bargo/최대가를 클라이언트에서 암호화 — 서버도 모름" (false: no client-side encryption in V2)

**Issue:** PLAN_V2.md §0 + `docs@bargo/threat-model.md` Row 2 explicitly state the service operator IS a trusted broker that sees plaintext for ~15s and then auto-purges. The V2 demo pitch is "honest trust model." These UI strings replay the V1 lie and will backfire the moment a judge reads `threat-model.md` or asks "but your DB sees it, right?". Also directly contradicts the "ConditionInput encryption" claim since `lib@bargo/encrypt.ts` is deleted and no encryption happens.

**Impact:** Demo credibility (Innovation 30% @bargo/ Technical Excellence 20% criteria for NEAR AI). A judge comparing the on-stage pitch against threat-model.md will see the contradiction. Also makes the ConditionInput test `shows TEE encryption hint` (`test@bargo/components@bargo/ConditionInput.test.tsx:47-49`) assert on a deceptive string.

**Fix:** Rewrite all five strings to the V2 honest line, e.g.:
> "이 가격은 NEAR AI TEE 안 LLM으로 전달됩니다. 상대방은 절대 볼 수 없고, 운영자는 합의 중 ~15초간만 보며 거래 완료 즉시 자동 삭제됩니다."

Update `ConditionInput.test.tsx` to match.

---

### BLOCKER #2 — README.md and PRD.md §2.6-2.9 are stale V1 content
**Files:**
- `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/README.md:5-95` — claims "122 tests", "services@bargo/tee", `MOCK_TEE=1`, "packages@bargo/crypto", "TEE 공개키로 암호화", `ENCLAVE_SIGNER_ADDRESS`, `forge script` with `addEnclaveSigner` semantics, "Python 3.12, uv" prerequisite, "Mock mode (no TEE or contracts needed)"
- `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/PRD.md:73-282` — §2.4 acceptance lines 74, 82 still say "TEE 공개키로 암호화"; §2.6 architecture diagram uses V1 flow with `GET @bargo/tee-pubkey`, enc_min_sell blobs, etc.; §2.7 data model still has `enc_min_sell` columns, on-chain `attestationHash`@bargo/`enclaveId`; §2.8 algorithm in Python with `decrypt()` calls; §2.9 threat table says "클라이언트에서 TEE 공개키로 암호화"

**Issue:** PLAN_V2.md explicitly tasks Agent D with rewriting PRD §2.6-2.9 + README. The V2 refactor PRs (#8-#11) did not land these rewrites. Anyone (judge, teammate, reviewer A) who opens these files sees V1.

**Impact:** Either a judge reads the stale README and fails to run the demo (`MOCK_TEE=1`, `services@bargo/tee` don't exist), or reads PRD and concludes the project is dishonest because the code and spec diverge by the full V2 scope.

**Fix:** Ship the PLAN_V2 §7 Task 1.4 rewrite that is still open. README needs: NEAR AI API key setup, new Quick start (no Python@bargo/uv), new architecture diagram (no self-hosted TEE), new demo checklist (no `ENCLAVE_SIGNER_ADDRESS`, no `addEnclaveSigner`), updated test totals (28+34 TS). PRD needs: §2.6 new diagram, §2.7 plaintext+auto-purge columns + new on-chain Deal struct (`nearAiAttestationHash` instead of `attestationHash`+`enclaveId`), §2.8 new TS pseudocode (no `decrypt()`), §2.9 threat table matching threat-model.md.

---

### BLOCKER #3 — `apps@bargo/web@bargo/README.md` still documents V1 (MOCK_TEE, encrypt.ts, MOCK_TEE_PUBKEY)
**File:** `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/apps@bargo/web@bargo/README.md:17,24,27-33,62`
- Lists `NEXT_PUBLIC_MOCK_TEE_PUBKEY` as an env var (it does not exist in code any more)
- Demo checklist instructs judge to set `NEXT_PUBLIC_MOCK_TEE_PUBKEY`
- "Mock flow (MOCK_TEE=1)" entire section
- Architecture block documents `lib@bargo/encrypt.ts — wraps @bargo@bargo/crypto seal()` — file deleted

**Impact:** Any judge following this README will set an env var that does nothing and then never reach `@bargo/deals@bargo/:id` because the service side has no mock mode.

**Fix:** Rewrite the web README. Remove `NEXT_PUBLIC_MOCK_TEE_PUBKEY`, remove the `MOCK_TEE=1` section, replace with "run `apps@bargo/negotiation-service` + set `NEAR_AI_API_KEY`", and delete the `lib@bargo/encrypt.ts` bullet.

---

### BLOCKER #4 — `scripts@bargo/qa-seal.mjs` still exists and imports deleted `@bargo@bargo/crypto`
**File:** `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/scripts@bargo/qa-seal.mjs:11`
```js
import { seal } from '@bargo@bargo/crypto';
```

**Issue:** PLAN_V2 §0 Deleted column lists `scripts@bargo/qa-seal.mjs` as deleted, and `packages@bargo/crypto` is gone (commit `f325d57`). This file is imported by `scripts@bargo/qa-scenarios.mjs`, which will throw `ERR_MODULE_NOT_FOUND` the moment anyone runs it. The file is dead but presence signals "we forgot to clean up."

**Impact:** Any `node scripts@bargo/qa-scenarios.mjs` invocation crashes. Also leaves a V1 artifact visible at the repo surface.

**Fix:** `git rm scripts@bargo/qa-seal.mjs`; rewrite `scripts@bargo/qa-scenarios.mjs` + `scripts@bargo/qa-web-bug-repro.mjs` for plaintext DTOs (PLAN_V2 Task 1.4 step 4). If time is short, at minimum delete qa-seal.mjs so qa-scenarios is the only remaining V1 script.

---

### HIGH #1 — ConditionInput unit test locks in the wrong privacy claim
**File:** `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/apps@bargo/web@bargo/test@bargo/components@bargo/ConditionInput.test.tsx:47-49`
```ts
it('shows TEE encryption hint', () => {
  ...
  expect(screen.getByText(@bargo/암호화되어 TEE로 전송@bargo/)).toBeInTheDocument();
});
```
**Issue:** This test passes today only because the component has the wrong string. Once BLOCKER #1 is fixed, this test will correctly fail. Worth flagging so Agent C updates both in one pass.

**Fix:** After rewriting the component copy, rewrite the assertion: `expect(screen.getByText(@bargo/NEAR AI TEE.*운영자는.*자동 삭제@bargo/)).toBeInTheDocument();` or similar.

---

### HIGH #2 — `apps@bargo/web@bargo/app@bargo/layout.tsx:21` hardcodes `maximum-scale=1` viewport
**File:** `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/apps@bargo/web@bargo/app@bargo/layout.tsx:21`
```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" @bargo/>
```
**Issue:** `maximum-scale=1` disables pinch-zoom — violates WCAG SC 1.4.4 and is an accessibility anti-pattern. Next.js 14 already emits a default viewport; this hand-rolled tag overrides it. This was flagged LOW in V1 UX review but hasn't been removed.

**Fix:** Delete line 21 entirely; use Next.js viewport export (already defined in metadata config above).

---

### HIGH #3 — Stale `ENCLAVE_SIGNERS` and `ENVELOPE_VERSION` still exported from shared
**File:** `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/packages@bargo/shared@bargo/src@bargo/constants.ts:28-35`
**Issue:** Both constants are V1 artifacts. They don't break builds (no consumer imports them), but they're actively misleading to any developer reading the shared contract. PLAN_V2 §0 says shared types are a "contract" that judges and teammates read.

**Fix:** Delete lines 28-35. Optionally add `@bargo/@bargo/ V1 AttestationLib removed — see PLAN_V2.md §3.3` as a tombstone comment.

---

### HIGH #4 — Explorer URL in AttestationViewer is wrong domain
**File:** `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/apps@bargo/web@bargo/components@bargo/AttestationViewer.tsx:70`
```ts
const hoodiUrl = `https:@bargo/@bargo/explorer.hoodi.network@bargo/search?q=${nearAiAttestationHash}`;
```
**Issue:** The `docs@bargo/attestation-verification.md:52` references `hoodiscan.status.network` as the Status Network Hoodi explorer. `explorer.hoodi.network` is not the same service and may not resolve (or may resolve to a different chain). Clicking the "익스플로러" link in the demo shot will likely 404.

**Fix:** Change to `https:@bargo/@bargo/hoodiscan.status.network@bargo/search?q=${nearAiAttestationHash}` (verify format by hand), or to the transaction URL after the NegotiationSettled event is indexed. Ideally use `status.onchainTxHash` when present rather than searching by hash.

---

### HIGH #5 — `canonicalize` convention: verifier reimplements instead of importing service's library
**Files:**
- `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/scripts@bargo/verify-attestation.mjs:50-55` — home-rolled stringify
- `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/apps@bargo/negotiation-service@bargo/src@bargo/nearai@bargo/attestation.ts:45-49` — uses `canonicalize` npm (RFC 8785)

**Issue:** I ran both implementations against the fixture (ASCII hex + integer timestamp + Korean text + scientific notation float) and they coincide today. **BUT** RFC 8785 has specific rules for number formatting (no exponent when possible, specific precision) and Unicode escape sequences. The hand-rolled version defers to `JSON.stringify` which V8@bargo/Node's implementation happens to agree on for common cases — but this is implementation-dependent and not spec-pinned. If the real NEAR AI attestation bundle ever includes a non-standard number or particular Unicode chars (e.g., NEAR AI decides to include a float fraction in `timestamp` or Unicode in a future metadata field), the verifier and service will diverge silently and `onchainHashMatch = false`.

**Fix:** Make `scripts@bargo/verify-attestation.mjs` `import canonicalize from 'canonicalize'` (scripts@bargo/package.json already has it per PLAN_V2 §5, verify with `cat scripts@bargo/package.json`). This guarantees bit-for-bit equivalence with the service. Keep the current in-file implementation as a fallback only with a `@bargo/@bargo/ POTENTIAL DIVERGENCE RISK` comment.

---

### HIGH #6 — `apps@bargo/web@bargo/app@bargo/deals@bargo/[id]@bargo/page.tsx:82` uses `void agreedPrice` marker; escrow lock is demo-fake
**File:** `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/apps@bargo/web@bargo/app@bargo/deals@bargo/[id]@bargo/page.tsx:71-88`
**Issue:** The "lockEscrow" handler says `@bargo/@bargo/ For demo: simulate success` and just flips `setEscrowLocked(true)` without any `useWriteContract` call. PRD §2.4 US-4 acceptance "구매자 가스비 0 (Status Network 가스리스 검증)" is not demonstrable — there's no tx, so gasless is not proven. PLAN_V2 §0.3 promises on-chain Hoodi tx as Phase 2.1 gate.

**Impact:** Demo step "2:30~2:50 Karma+정산" can't show the QR + gasless escrow flow end-to-end. Status Network track 25% Karma + gasless evaluation gets nothing to score.

**Fix:** Wire `useWriteContract({ abi: bargoEscrowAbi, functionName: 'lockEscrow', args: [dealId], value: BigInt(agreedPrice) })` using `ADDRESSES[374].bargoEscrow`. Similarly wire `confirmMeetup`. If time is short for Phase 2, at minimum add a clearly labeled `demo-mode` toggle and document in README.

---

### HIGH #7 — `apps@bargo/web@bargo/app@bargo/listings@bargo/page.tsx:27-68` DEMO_LISTINGS use invalid hex addresses
**File:** `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/apps@bargo/web@bargo/app@bargo/listings@bargo/page.tsx:28,42,56`
```ts
seller: '0xAlice000000000000000000000000000000000000',
seller: '0xBob0000000000000000000000000000000000000',
seller: '0xCarol00000000000000000000000000000000000',
```
**Issue:** `'A'` @bargo/ `'l'` @bargo/ `'i'` @bargo/ `'c'` @bargo/ `'e'` @bargo/ `'B'` @bargo/ `'b'` @bargo/ `'C'` @bargo/ `'r'` @bargo/ `'o'` are not valid hex characters. These are typed as `Address` (0x-prefixed hex). `ListingCard` consumers who pass these to viem helpers (`formatAddress`, `getAddress`) will throw. Also the `'0xBob...'` string is 42 chars but contains non-hex, so `isAddress()` returns false.

**Impact:** Listings page renders today because `ListingCard` doesn't validate, but `listings@bargo/[id]@bargo/page.tsx:77` does `address?.toLowerCase() === listing.seller.toLowerCase()` which also works. However if any wagmi hook is called with these as args, it throws. Brittle — likely to surface in the demo when a judge clicks "오퍼하기."

**Fix:** Replace with real 0x-hex addresses (zero-pad `0x0000...0001`, or use known Hardhat demo addresses `0xf39f...`@bargo/`0x7099...`@bargo/`0x3c44...` which already appear in `UserKarma.tsx:26-28`).

---

### HIGH #8 — `apps@bargo/web@bargo/app@bargo/deals@bargo/[id]@bargo/page.tsx:44` effect-less race: polling continues after `agreement`
**File:** `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/apps@bargo/web@bargo/app@bargo/deals@bargo/[id]@bargo/page.tsx:44,48-56`
**Issue:** `refetchInterval: !escrowLocked && !isTerminal ? 1000 : false`. `isTerminal` is set by a `useEffect` watching `status?.state`, so there's a 1-tick window where the query refetches after reaching `agreement` before `setIsTerminal(true)` runs. Minor wasted request, not a correctness bug. But similar pattern: `agreement` state also triggers confetti via a timer, and if the component re-renders during that 800ms, the state machine gets confused.

**Fix:** Compute `isTerminal` inline from `status?.state` (remove the useEffect) or use `select:` option on React Query to derive. Not a demo blocker but clean code standards.

---

### MEDIUM #1 — `NegotiationStatus` props `listingId`@bargo/`previousBid` are unused
**File:** `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/apps@bargo/web@bargo/components@bargo/NegotiationStatus.tsx:12-13,57`
**Issue:** Props are declared and passed from deals page (`.tsx:173-174`) but destructured only as `{ state, attestation }`. They were presumably intended for retry-with-prefill UX but are never referenced inside the component. This triggered no warning only because the interface isn't `Required`.

**Fix:** Either remove the two props (and delete the pass-through from deals page), or implement the retry-prefill UX they imply.

---

### MEDIUM #2 — Privacy claim in PRD.md §2.4 US-1@bargo/US-2 acceptance uses V1 language
**File:** `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/PRD.md:74,82`
Acceptance criteria still say "최저가 + 자연어 조건은 클라이언트에서 TEE 공개키로 암호화 후 전송". The V2 honest statement is that plaintext goes over HTTPS to a trusted broker that auto-purges.

**Fix:** Rewrite acceptance lines in the PRD §2.4 rewrite (part of BLOCKER #2).

---

### MEDIUM #3 — `apps@bargo/web@bargo/components@bargo/AttestationViewer.tsx:140` GitHub link is a placeholder
**File:** `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/apps@bargo/web@bargo/components@bargo/AttestationViewer.tsx:139-146`
```ts
href="https:@bargo/@bargo/github.com@bargo/bargo-app@bargo/bargo#attestation-verification"
```
**Issue:** Organization `bargo-app` doesn't exist. Demo judges who click "GitHub 검증 가이드" land on a 404. There's a `docs@bargo/attestation-verification.md` already written — ideally link to an actual public repo path.

**Fix:** Replace with actual repo URL or with a relative link to `@bargo/docs@bargo/attestation-verification` served by the app.

---

### MEDIUM #4 — `app@bargo/listings@bargo/page.tsx:10` dev URL env mismatch
**File:** `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/apps@bargo/web@bargo/app@bargo/listings@bargo/page.tsx:10`
```ts
process.env.NEGOTIATION_SERVICE_URL ?? process.env.NEXT_PUBLIC_NEGOTIATION_SERVICE_URL
```
**Issue:** This RSC prefers `NEGOTIATION_SERVICE_URL` (server-only) over `NEXT_PUBLIC_NEGOTIATION_SERVICE_URL` (which the rest of the app uses). `.env.example` likely only documents the `NEXT_PUBLIC_` one. If they diverge, RSC hits one server and client hooks hit another.

**Fix:** Use a single env var, prefer `NEXT_PUBLIC_*` to match the rest of the code. Or document both in `apps@bargo/web@bargo/README.md` env table.

---

### MEDIUM #5 — Missing AttestationViewer edge-case test: bundle fetch error
**File:** `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/apps@bargo/web@bargo/test@bargo/components@bargo/AttestationViewer.test.tsx`
**Issue:** There's no test for the expando error path (`error` branch in `AttestationBundleExpando`). It renders "번들을 불러올 수 없습니다." but no test asserts this.

**Fix:** Add a test mocking `useAttestationBundle` to return `{ error: new Error('x') }` and assert the message renders.

---

### MEDIUM #6 — `MeetupQR.tsx:56` manual-paste fallback weakens security story
**File:** `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/apps@bargo/web@bargo/components@bargo/MeetupQR.tsx:44-63`
**Issue:** Copy says "데모: 상대방 QR의 내용을 직접 붙여넣기" — makes the QR meetup flow a trust exercise rather than a device-presence proof. PRD §2.12 "2:30~2:50 Karma·정산" explicitly promises "QR로 만남 인증." For demo this is fine, but mark clearly in the PRD that this is a demo shortcut (not a promise) and confirm Reviewer A that the on-chain confirmMeetup still requires both sigs (not just the manual paste).

**Fix:** Add a visible "demo mode" badge and a README note under Demo Checklist. Keep the code but label it.

---

### MEDIUM #7 — `fetchListing` in `lib@bargo/api.ts:55-69` returns untyped `status: string` widening
**File:** `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/apps@bargo/web@bargo/lib@bargo/api.ts:55-69`
**Issue:** The inline fetch response type declares `status: string` where `ListingPublic.status` is the 5-variant literal union. `listings@bargo/[id]@bargo/page.tsx:96-97` does `listing.status === 'open'` which works because of string narrowing, but the type drift means a real server change could silently break consumers.

**Fix:** Import `ListingPublic` from `@bargo@bargo/shared` and type the response as `Promise<ListingPublic>`. The shared schema already defines this contract.

---

### LOW #1 — `next.config.mjs` and icon generator reference the old ui-review plan
**File:** `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/apps@bargo/web@bargo/next.config.mjs`
Minor — skipped deep read; if there are webpack@bargo/`serverComponentsExternalPackages` entries referencing `@bargo@bargo/crypto`, those would error in prod build (build passed, so it's clean or commented out).

---

### LOW #2 — `apps@bargo/web@bargo/app@bargo/page.tsx:63` feature copy says "NEAR AI LLM이 조건 파싱"
File is otherwise fine but this row pairs with BLOCKER #1's dishonest sibling on line 62. When you rewrite 62 for V2 honesty, keep this line consistent ("NEAR AI Cloud TEE의 qwen3-30b LLM").

---

### LOW #3 — `apps@bargo/web@bargo/components@bargo/AttestationViewer.tsx:12` truncateHex logic
Looks fine; for a 66-char 0x-hash with default `chars=8`, it truncates to `0xaabbccdd...eeffgghh`. Works. No issue, just pointing out it was asked about.

---

### LOW #4 — Emoji in UI (🛡️, 🤖, 🎉, 🎊)
Used deliberately in demo UI (AttestationViewer, NegotiationStatus, deal complete). Consistent with hackathon visual tone — ignore if policy permits.

---

## Layer-to-layer coherence audit

- **Web ↔ Service** (REST DTOs match `schemas.ts`)
  - POST @bargo/listing body (`listings@bargo/new@bargo/page.tsx:77-84`) matches `PostListingRequest` in types.ts + `postListingRequestSchema`. ✓
  - POST @bargo/offer body (`offers@bargo/new@bargo/[listingId]@bargo/page.tsx:67-74`) matches `PostOfferRequest`. ✓
  - GET @bargo/status polling shape (`useNegotiationStatus`) matches `GetStatusResponse`. ✓
  - GET @bargo/attestation@bargo/:dealId matches `NearAiAttestationBundle`. ✓
  - `fetchListing` returns an inline type (not `ListingPublic`) — MEDIUM #7.
  - `lib@bargo/api.ts` has no `teePubkey` @bargo/ encrypt surface. ✓

- **Web ↔ Contract** (ABI calls match deployed interface)
  - `UserKarma.tsx:48` calls `karmaReader.getTier(address)` — present in `karmaReaderAbi`.
  - `listings@bargo/[id]@bargo/page.tsx:47` same. ✓
  - `deals@bargo/[id]@bargo/page.tsx:79` does NOT actually call `lockEscrow` (just simulated) — HIGH #6.
  - No V1 `addEnclaveSigner` references in web. ✓
  - `bargoEscrowAbi` has `settleNegotiation` with V2 signature (no teeSignature, no enclaveId) — matches `types.ts` expectation.

- **Service ↔ Contract** (covered by Reviewer A) — cross-checked: `scripts@bargo/verify-attestation.mjs` inline ABI matches event signature in `packages@bargo/shared@bargo/src@bargo/abi@bargo/BargoEscrow.ts` (NegotiationSettled with indexed dealId@bargo/listingId@bargo/nearAiAttestationHash). ✓

- **Shared types referenced consistently** — ✓ across web + service + scripts.

---

## Privacy adherence audit

### Claim 1: NEAR AI Cloud TEE anchors inference
- **Honored in code:** ✓. Service calls NEAR AI + fetches attestation + verifier re-checks TDX + NVIDIA NRAS. Web renders hash + verifier CTA.
- **Honored in docs:** PARTIAL. `docs@bargo/threat-model.md` + `docs@bargo/attestation-verification.md` are correct. `README.md` is stale V1. `PRD.md §2.6-2.9` is stale V1.

### Claim 2: Operator trusted broker with auto-purge
- **Honored in code:** ✓. Schema.sql has the `AFTER UPDATE ON negotiations WHEN NEW.state='completed'` trigger. No info-level plaintext logs in routes.
- **Honored in UI copy:** REGRESSED (BLOCKER #1). Five UI strings still say "operator@bargo/server can't see it" — the V1 lie.
- **Honored in docs:** threat-model.md OK. README + PRD regressed (BLOCKER #2).

### Claim 3: Counterparty cannot see floor
- **Honored in code:** ✓. `GET @bargo/listing` + `GET @bargo/listings` + `GET @bargo/status` endpoints return no plaintext reservation fields. `NegotiationStatus` fail state shows only the merged agreement, not raw conditions. Privacy test (`privacy.test.tsx`) enforces post-submit state clear.
- **Residual risk:** user pasting price into condition text → `ConditionInput.tsx` detects email@bargo/phone but not price-shape content. Acceptable per threat model.

---

## Demo scenario (PRD §2.12) walkthrough

- **0:00-0:20 pain**: YES — app@bargo/page.tsx:29-44 shows the 23개@bargo/3.4일 stats. ✓
- **0:20-0:35 solution reveal**: YES — landing + "NEAR AI TEE × Status" copy. ✓ (but see BLOCKER #1 copy consistency)
- **0:35-1:50 live demo (fail)**: YES — `NegotiationStatus.tsx:72-87` shows "협상 실패" without leaking failureReason. ✓
- **1:50-2:30 retry (agreement)**: YES — AttestationViewer renders on agreement state with hash + verify CTA. ✓
- **2:30-2:50 Karma gate + QR meetup**: WITH-FIX — Karma gate works (`listings@bargo/[id]@bargo/page.tsx:154`). QR meetup flow is **demo-fake** (HIGH #6): lockEscrow doesn't call the contract, so no Hoodi tx, so gasless 검증 unseen.
- **2:50-3:00 vision**: YES — slide content only, no code dep.

---

## What's done well
- Privacy UX test (`privacy.test.tsx`) enforces state-clear invariant as a test, not just a convention.
- AttestationViewer: clean client-only component, good truncation, explicit `if (!attestation) return null` guard, helpful Korean copy on "무결성 재확인." The expando lazy-loads on open (good perf).
- Bot-vs-bot animation amplitude (`tailwind.config.ts:54-66`) correctly amplified per V1 UX review (±18px). ✓
- Safe-area-inset bottom padding applied on all sticky action bars (V1 UX review 1B fix in place). ✓
- `packages@bargo/shared@bargo/src@bargo/types.ts` is clean, well-commented, has the P0 `NearAiAttestationBundle` with schema deviation doc comment.
- Schema drift enforcement: `packages@bargo/shared@bargo/src@bargo/schemas.ts` declares every DTO with Zod, service uses `postListingRequestSchema.safeParse`. No type-only drift.
- Auto-purge in SQL trigger AND app-level (defense in depth per threat-model.md Row 2).

---

## Questions for Reviewer A @bargo/ team lead

1. **Escrow lock wiring** (HIGH #6): is Phase 2 deployment happening before demo day? If yes, who wires `lockEscrow`@bargo/`confirmMeetup` via wagmi? If no, do we ship demo-mode label openly?
2. **Explorer URL** (HIGH #4): what's the canonical Status Network Hoodi explorer base URL we're committing to in docs?
3. **Canonicalize parity** (HIGH #5): is there an appetite to make `scripts@bargo/verify-attestation.mjs` import the `canonicalize` npm package instead of re-rolling? Would need `scripts@bargo/package.json` already lists it (per PLAN_V2 §5 it should).
4. **GET @bargo/listings contract**: service returns `{ listings: ListingPublic[] }` wrapper; web uses body.listings. Is that wrapper the final contract, or should we flatten? `schemas.ts` doesn't declare a listings-list schema.
5. **When does NEAR_AI_MR_TD pin ship?** attestation-verification.md has TBD — this should be committed before demo day so the 6th verifier check doesn't print "skipped."
