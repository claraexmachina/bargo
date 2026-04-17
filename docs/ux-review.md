# UX Review — Bargo v1 Demo

Review target: `@bargo/Users@bargo/claraexmachina@bargo/bargo@bargo/apps@bargo/web` (Next.js 14 App Router, Tailwind, wagmi).
Demo target: 2 phones @ ~390px width, 3-min live scenario (PRD §2.12).

## Summary

- **1 blocker**, **6 high**, **7 medium**, **4 low**
- **Overall demo-ready: NO — WITH-FIXES** (the blocker is a product-logic bug in mock TEE that makes the PRD §2.12 "협상 실패 — 조건 불일치" shot impossible when running in mock mode)
- **Estimated fix time: ~3.5h** if triaged aggressively (blocker + top-6 high)

---

## Audit 1 — Mobile Ergonomics

### 1A. Fixed bottom action bar leaves no body padding on listings list
- `apps@bargo/web@bargo/app@bargo/listings@bargo/page.tsx:71-103` — no `pb-*` on the page. When the page is short it's fine, but when a user deep-scrolls a long list the footer (`apps@bargo/web@bargo/app@bargo/layout.tsx:50`) and the TanStack devtools don't collide; OK at 390px. Low.

### 1B. Bottom action bars use `fixed` without iOS safe-area
- `apps@bargo/web@bargo/app@bargo/listings@bargo/new@bargo/page.tsx:270`
- `apps@bargo/web@bargo/app@bargo/listings@bargo/[id]@bargo/page.tsx:112`
- `apps@bargo/web@bargo/app@bargo/offers@bargo/new@bargo/[listingId]@bargo/page.tsx:179`

  The bottom bar is `fixed bottom-0 left-0 right-0 ... p-4`. On iPhones with home indicator, the tappable zone overlaps the system gesture area. The content padding (`pb-20` @bargo/ `pb-24`) prevents scroll cut-off, but the bar itself needs `pb-[env(safe-area-inset-bottom)]` (or `pb-[max(1rem,env(safe-area-inset-bottom))]`). **Severity: HIGH** — looks ugly on the demo phone.

  Fix: add `style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}` or Tailwind `pb-safe` (needs plugin) on the fixed bars.

### 1C. Fixed bar covers submit area on Korean IME mobile keyboard
- `apps@bargo/web@bargo/app@bargo/listings@bargo/new@bargo/page.tsx:270-282` and `apps@bargo/web@bargo/app@bargo/offers@bargo/new@bargo/[listingId]@bargo/page.tsx:179-186`

  When the `ConditionInput` textarea is focused (it's the last field before the bar), the mobile keyboard pushes the focused textarea up but the `fixed` Submit button stays visually at bottom-of-viewport, often covering what the user is typing. Because the bar isn't inside the natural flow, `scrollIntoView` browser heuristics don't help. **Severity: HIGH**.

  Fix: convert the bottom action bars to sticky-in-flow (`sticky bottom-0` inside the form container) OR detect `visualViewport` resize to hide the bar while keyboard is open. Simplest demo fix: change `fixed` → `sticky` and remove the `fixed`-specific negative spacing.

### 1D. `<select>` native styling on iOS Safari is tiny
- `apps@bargo/web@bargo/app@bargo/listings@bargo/new@bargo/page.tsx:170-181` (category) and `:251-262` (karma tier)

  `h-10` with `text-sm` renders ~36-40pt. iOS HIG says ≥44pt. **Severity: MEDIUM**.
  Fix: add `h-11` (44px) to selects, or replace with a Radix Select.

### 1E. Header nav links are tiny touch targets
- `apps@bargo/web@bargo/app@bargo/layout.tsx:32-43` — `매물 목록` @bargo/ `등록` are `text-sm` `text-muted-foreground` plain anchors. At 14px each with only text-node padding, the touch box is ~18pt tall. **Severity: MEDIUM** — not fatal on demo (the CTA is on `page.tsx`), but will bite if the judge taps the header.
  Fix: wrap in `py-2 px-3` or use `Button variant="ghost" size="sm"`.

### 1F. Wallet disconnect address code is 12px
- `apps@bargo/web@bargo/components@bargo/WalletConnect.tsx:15` — `text-sm font-mono` + truncated hex. On demo phone at ~390px this is fine but it can clip next to the header logo. **Severity: LOW**.

### 1G. Listing seller code block
- `apps@bargo/web@bargo/app@bargo/listings@bargo/[id]@bargo/page.tsx:83-85` — `text-xs` for seller address. Fine, but wrap the container with `break-all` safety (address + KarmaBadge can overflow on narrow phones). Currently has `flex-wrap` so OK. **LOW**.

### 1H. Page title stats row can wrap awkwardly
- `apps@bargo/web@bargo/app@bargo/page.tsx:29-44` — three stats with dividers use `gap-6`. At 390px - container padding = ~360px, gap-6 (24px) + text widths (23개 @bargo/ 3.4일 @bargo/ 5초) fits, but with Korean wide glyphs this may wrap. **LOW**.

### 1I. Bot-vs-bot animation legibility
- `apps@bargo/web@bargo/components@bargo/NegotiationStatus.tsx:14-45`

  - Duration: `animate-bounce-left` and `animate-bounce-right` (tailwind.config.ts:53-66) run at `0.8s ease-in-out infinite` — this is a continuous loop, not a 3-5s sequence. The poll interval in `app@bargo/deals@bargo/[id]@bargo/page.tsx:43` is 1s. State flips to `agreement@bargo/fail` within 1-5 server-side ticks, so the animation is visible only 1-5s in mock mode.
  - Motion: translate ±6px is very subtle for a phone video — will look static when filmed. **Severity: HIGH**.
  - Text: "판매자봇"@bargo/"구매자봇" at `text-xs` (12px) inside 80px boxes is at HIG floor but legible at demo distance; fine.

  Fix: amplify amplitude (translateX ±16-20px) and add a faint rotation@bargo/scale or pulse on the dots; consider a 4-5s total timeline so it's obvious on video. Also consider swapping rapid continuous bounce for a 2-frame "message flying back and forth" motif (3 messages over 4s).

### 1J. Privacy-note font size on TEE disclosure
- `apps@bargo/web@bargo/app@bargo/listings@bargo/new@bargo/page.tsx:217-219` and `:263-266` — `text-xs` (12px). Below the 14px threshold the brief requested. **Severity: MEDIUM** — especially this is the demo money text ("운영자도 알 수 없습니다").
  Fix: bump to `text-sm` and bold the key phrase; this is the shot you want on film.

### 1K. Home CTA button says "시작하기 →" goes to `@bargo/listings`, not a clear CTA for 2-phone demo
- `apps@bargo/web@bargo/app@bargo/page.tsx:48-54` — two side-by-side CTAs, both 48px tall (`size="lg"` = h-12). Thumb-reachable. **OK**.

### 1L. Listings grid breakpoint
- `apps@bargo/web@bargo/app@bargo/listings@bargo/page.tsx:95` — `grid gap-4 sm:grid-cols-2`. At 390px (<`sm`=640px), single column, no horizontal scroll. **OK**.

### 1M. No viewport-meta `maximum-scale`
- `apps@bargo/web@bargo/app@bargo/layout.tsx:21` — `maximum-scale=1` is already set (locks pinch-zoom, which can hurt accessibility). Consider dropping. **LOW**.

### Audit 1 overall
No horizontal scroll at 390px. No input field is literally hidden behind keyboard (all inputs scroll), but **1C** (fixed bar covering submit area while typing) is the dominant risk. **1I** (animation too subtle) is the second.

---

## Audit 2 — Privacy Leak Audit (CRITICAL)

### 2A. Reservation price state cleared after seal — OK
- `apps@bargo/web@bargo/app@bargo/listings@bargo/new@bargo/page.tsx:79-81` — `setMinPriceKrw('')`, `setConditions('')` immediately after sealing. **GOOD**.
- `apps@bargo/web@bargo/app@bargo/offers@bargo/new@bargo/[listingId]@bargo/page.tsx:55-57` — same pattern for `maxPriceKrw` and `conditions`. **GOOD**.

### 2B. State not cleared if `seal` throws — HIGH
- `apps@bargo/web@bargo/app@bargo/listings@bargo/new@bargo/page.tsx:62-113` and `...@bargo/offers@bargo/...@bargo/page.tsx:43-90`

  The clear (`setMinPriceKrw('')`) is inside `try` **after** `sealPrice(...)`. If seal throws (bad pubkey, crypto worker error), the raw price stays in state indefinitely and is still in the DOM (masked, but retrievable via React DevTools). **Severity: HIGH**.

  Fix: move the clears into a `finally` block, OR clear *before* `sealPrice` by capturing to locals first:
  ```ts
  const rawMin = minPriceKrw; setMinPriceKrw('');
  const rawCond = conditions; setConditions('');
  const encMinSell = sealPrice(pubkey, krwToWei(rawMin), tempListingId);
  ```

### 2C. `masked` mode in PriceInput reveals value on focus
- `apps@bargo/web@bargo/components@bargo/PriceInput.tsx:42` — when focused, the actual value is shown. That's expected UX for editing, but during the demo if the seller phone happens to be focused when filming, the plaintext shows. **Severity: LOW** (documented design, not a leak). Mitigation is rehearsal — ensure form is submitted (not focused) during the key shot.

### 2D. Network payload contents — verified safe
- `apps@bargo/web@bargo/lib@bargo/api.ts:67-72` posts `PostListingRequest` which (per schema) contains `encMinSell` and `encSellerConditions` only.
- `apps@bargo/web@bargo/app@bargo/listings@bargo/new@bargo/page.tsx:88-95` constructs the body from `askPriceWei` (public) + sealed blobs. No raw `minPriceWei` in the request. **GOOD**.
- Same for offer: `...@bargo/offers@bargo/...@bargo/page.tsx:67-74` — `bidPrice` (public) + `encMaxBuy` + `encBuyerConditions` + `rlnProof`. **GOOD**.

  **Recommended rehearsal check (untestable without live browser)**: open DevTools Network → POST `@bargo/listing` request body → confirm no `minPrice`, no raw conditions text. Add this to the demo checklist.

### 2E. localStorage — contains RLN identity secret only
- `apps@bargo/web@bargo/lib@bargo/rln.ts:23,32` — stores `rln_sk_{address}` (RLN identity secret, per-wallet). This is *not* a reservation price, but it **is** a cryptographic secret; confirm with the PRD intent — RLN SK is expected to be client-only. **OK**.
- No reservation price or condition text persisted. **GOOD**.

### 2F. Frontend console.log — clean
- `apps@bargo/web@bargo/scripts@bargo/make-icons.mjs:28-29` — dev build script only. No runtime frontend logging. **GOOD**.

### 2G. Negotiation service logging — MEDIUM
- `apps@bargo/negotiation-service@bargo/src@bargo/routes@bargo/offer.ts:43, 65, 80` logs `buyer` address + `listingId` + RLN reason. **OK** — no enc blobs or plaintext.
- `apps@bargo/negotiation-service@bargo/src@bargo/routes@bargo/offer.ts:104-105` stores `JSON.stringify(body.encMaxBuy)` etc. in DB — these are encrypted blobs, so fine at rest, BUT be aware: anyone with DB access can ship the blob to the TEE and get the plaintext out *only* if they control a TEE enclave. Acceptable per threat model.
- `apps@bargo/negotiation-service@bargo/src@bargo/routes@bargo/offer.ts:183-187` — negotiation complete@bargo/failed logs include `negotiationId` and `result` only. **GOOD**.
- **Risk**: Fastify default request logger. If Fastify's default request logging prints the body at debug level, any operator raising log level during demo leaks the encrypted blobs in logs. They're ciphertext, not plaintext — still, add `log.level='info'` in prod config and make sure `ajv`@bargo/`zod` validation errors don't echo the body.

  Verify `apps@bargo/negotiation-service@bargo/src@bargo/index.ts` logger config (not inspected in this audit — **recommend grepping** for `logger:` config and pinning `redact: ['req.body.encMinSell', ...]` via pino's redact option).

### 2H. Mock TEE logging — clean
- `services@bargo/tee@bargo/bargo_tee@bargo/negotiate.py:43-56` — `safe_log` drops any record whose message contains `min_sell`, `max_buy`, `seller_conditions`, `buyer_conditions`. **EXCELLENT** defensive pattern.
- The mock TEE at `apps@bargo/negotiation-service@bargo/src@bargo/tee@bargo/mock.ts` (lines 82-108) uses `open()` only and catches; no `console.log` of plaintext.

### 2I. Fail page reveals nothing — GOOD
- `apps@bargo/web@bargo/components@bargo/NegotiationStatus.tsx:62-77` — shows only `협상 실패 — 조건 불일치` and a retry CTA. No price@bargo/condition leak.
- Test coverage at `apps@bargo/web@bargo/test@bargo/components@bargo/NegotiationStatus.test.tsx:55-75` asserts no `700,000`, no `강남`, no reasonHash shown. **GOOD**.

### 2J. Fail message is hardcoded "조건 불일치" — can misrepresent no-ZOPA case — MEDIUM
- `apps@bargo/web@bargo/components@bargo/NegotiationStatus.tsx:66` — reads "협상 실패 — 조건 불일치" for *any* fail state, but the attestation can fail with reasonHash for `no_price_zopa`, `decryption_failed`, `llm_timeout`, or `conditions_incompatible` (see `services@bargo/tee@bargo/bargo_tee@bargo/negotiate.py`).

  From a privacy POV, *hiding the reason is actually correct* (demo's central pitch). From a UX POV, "조건 불일치" is a lie when the real reason is "가격 합의 불가" — but showing that leaks which axis failed. The PRD explicitly requires hiding the axis (§2.12: *"어느 조건이 충돌했는지조차 안 보입니다"*). **Keep the copy**, but consider changing it to the deliberately vague "협상이 성사되지 않았습니다 — 조건을 조정해보세요" to avoid the literal lie. **Severity: MEDIUM** (ethical polish, not leak).

### 2K. Suggested additional `privacy.test.tsx` assertions
- Current test only asserts state-clear in a harness mock — not the real `NewListingPage`. Suggest:
  - Integration test using real `NewListingPage` that fills min price, submits, and asserts the request body sent to `@bargo/listing` does **not** contain the plaintext digits (use `vi.spyOn(fetch)`).
  - Test for 2B: make `sealPrice` throw and assert state is still cleared.
  - Test that `localStorage` contains no key whose value includes the plaintext price.
  - Snapshot the React DevTools fiber state after submit — this is impractical; prefer DOM + network assertion.

### 2L. Error page path — HIGH
- `apps@bargo/web@bargo/app@bargo/listings@bargo/new@bargo/page.tsx:108-110` — on error, shows `등록 실패: ${msg}`. If the negotiation service returns a 400 that includes the plaintext body (Zod error messages can echo the failing value), that *plaintext could surface in a toast*. **Severity: HIGH**.
  - Review `apps@bargo/negotiation-service@bargo/src@bargo/routes@bargo/listing.ts:68-72` — it returns `result.error.issues[0]?.message`. Zod's default issue message for numeric fields like `askPrice` is typically safe ("Expected string, received number"), but a custom `.refine()` message could echo the bad input. Confirm no Zod refinement echoes encMinSell content.
  - Defense: strip all body from client error toasts. Replace `toast.error(\`등록 실패: ${msg}\`)` with `toast.error('등록에 실패했습니다. 다시 시도해주세요.')` and log the real error to a guarded console (dev-only).

### 2M. Same toast echo risk on offer page
- `apps@bargo/web@bargo/app@bargo/offers@bargo/new@bargo/[listingId]@bargo/page.tsx:80-86` — same pattern. Same **HIGH** fix.

### Audit 2 verdict
The architecture is correct. Three runtime risks (2B, 2L, 2M) can leak plaintext under error paths. Fix before demo.

---

## Audit 3 — Demo Scenario Compliance (PRD §2.12)

### Phase 0:35~1:50 — Live demo (condition mismatch failure)

**Shot target**: Seller listing 맥북 800K @bargo/ 700K floor, conditions "강남@bargo/송파, 평일 19시+, 박스 없음", Tier 3. Buyer offers 700K@bargo/750K, conditions "강남, 토요일만", Tier 1. 5s later → "협상 실패 — 조건 불일치".

**Can the UI produce this shot?**

| Sub-element | Status | Evidence |
|---|---|---|
| Seller inputs max@bargo/min, conditions, karma tier | **YES** | `app@bargo/listings@bargo/new@bargo/page.tsx:196-267` — all three inputs present |
| Seller Karma Tier 3 visible on-screen | **NO — BLOCKER-adjacent** | `app@bargo/listings@bargo/[id]@bargo/page.tsx:87` hardcodes `<KarmaBadge tier={0} @bargo/>`. The seller's own tier is never shown. The listing detail shows **wrong** tier (always 0). Demo script says "Karma Tier 3 표시". **HIGH.** Fix: either read from chain via `useReadContract` or accept a dev prop to force tier=3 for Alice. |
| Buyer Karma Tier 1 visible | **NO** | Offer page `app@bargo/offers@bargo/new@bargo/[listingId]@bargo/page.tsx` shows no Karma badge for the buyer at all. **HIGH.** Add `<KarmaBadge tier={buyerTier} @bargo/>` near the wallet address. |
| Both phones show "협상 실패 — 조건 불일치" within 5s | **CONDITIONAL** | Works with *real* TEE (`services@bargo/tee`, see negotiate.py:155-183) because it runs LLM parse + `match_conditions`. Does **NOT** work with mock TEE — `apps@bargo/negotiation-service@bargo/src@bargo/tee@bargo/mock.ts:76-145` ignores conditions entirely and always agrees if `max_buy >= min_sell`. Given the PRD floors are 700K@bargo/750K, the mock will **succeed** instead of failing. **BLOCKER for mock-mode demo.** |

**Fix for the blocker**:
Option A (best): require real TEE at `services@bargo/tee@bargo/` to be running for live demo. Document this in `apps@bargo/web@bargo/README.md` demo checklist and prep a backup video from a real-TEE run.
Option B (fast): upgrade mock to at least *text-match* conditions so the scripted inputs deterministically fail. E.g., if seller_conditions contains "평일" and buyer_conditions contains "토요일" (and no weekday keyword), return `conditions_incompatible`. ~30 min work at `apps@bargo/negotiation-service@bargo/src@bargo/tee@bargo/mock.ts`.

### Phase 1:50~2:30 — Retry with fixed conditions

Buyer updates to "평일 가능, 강남 가능, 카드@bargo/현금 OK", both phones show "725,000원, 강남역 8번출구 금요일 19:30".

| Sub-element | Status | Evidence |
|---|---|---|
| Buyer can resubmit with new conditions | **PARTIAL** | After fail, NegotiationStatus shows a "다시 시도" button (`components@bargo/NegotiationStatus.tsx:70-73`) that calls `onRetry → router.push('@bargo/listings')` — i.e., **sends them back to the listings list**, not to the pre-filled offer form with the previous bid. **HIGH.** Reviewer@bargo/judge sees the buyer scrolling back. Fix: pass `onRetry` that routes to `@bargo/offers@bargo/new@bargo/${listingId}` with bid preserved (query param or localStorage draft). |
| Agreed price "725,000원" display | **YES** | `components@bargo/NegotiationStatus.tsx:91-94` uses `formatKRW(payload.agreedPrice)` → `₩725,000`. Note: PRD says "725,000원" but formatter outputs "₩725,000". Cosmetic but inconsistent with spec. **LOW**. |
| Location "강남역 8번출구" | **NO** | Mock returns `"gangnam"` (literal string, `tee@bargo/mock.ts:28-32`). Real TEE returns the `location` string verbatim from LLM output. Need the real TEE with a fixture that outputs `강남역 8번출구` and mock needs same string if used. **HIGH.** Fix mock constants to match demo script. |
| Meetup time format "금요일 19:30" | **PARTIAL** | `formatMeetTime` (`lib@bargo/format.ts:57-66`) uses `ko-KR` locale with `weekday:short, hour:2-digit, minute:2-digit` → renders like "4월 20일 (월) 19:00". The demo script wants "금요일 19:30". Fix date fixture to fall on a Friday at 19:30 and verify locale output. **MEDIUM**. |

### Phase 2:30~2:50 — Tier 0 rejection + QR meetup

| Sub-element | Status | Evidence |
|---|---|---|
| Tier 0 user offer on 500K+ listing → rejected by contract | **UI-SIDE ONLY PARTIAL** | `app@bargo/offers@bargo/new@bargo/[listingId]@bargo/page.tsx:80-82` shows `Karma 티어가 부족합니다` toast on 403. Contract enforcement is out-of-scope for this audit but the UI path works. **UX issue**: when the user clicks "오퍼하기 →" on the listing detail, the detail page at `app@bargo/listings@bargo/[id]@bargo/page.tsx:129-137` doesn't pre-check the user's tier vs. `listing.requiredKarmaTier` and the button is still enabled. Clicking it takes them to the offer form, they fill it out, submit, then get rejected. Better UX: disable the button with label "Tier 2 이상만 오퍼 가능" and show a tooltip. **HIGH**. |
| QR meetup confirm → escrow release | **MOCKED** | `app@bargo/deals@bargo/[id]@bargo/page.tsx:89-114` — scan fires setTimeout 800ms → confetti. On-chain tx stub (`writeContractAsync`) is not called (line 79: "For demo: simulate success"). Works for the shot, but any blockchain judge will notice. Document as intentional mock in README. **MEDIUM**. |
| Manual QR paste flow | **YES** | `components@bargo/MeetupQR.tsx:44-62` provides a textbox to paste the other party's JSON. Functional for 2-phone demo (both phones share the page, paste each other's QR payload). **GOOD**. |

### Overall Audit 3 verdict

- Phase 1 has a **BLOCKER** in mock mode (conditions mismatch is never produced).
- Phase 2 has **HIGH** UX issues (retry routing, agreed price display).
- Phase 3 has one **HIGH** (Tier 0 button enablement).

Must-fix before film day: blocker + 3 highs.

---

## Audit 4 — Copy & Voice

### 4A. Mixed Korean@bargo/English labels — MEDIUM
- `app@bargo/listings@bargo/new@bargo/page.tsx:128` — `매물 등록 (New Listing)` parenthetical English
- `:232` — `자연어 조건 입력` (OK, no English)
- `app@bargo/offers@bargo/new@bargo/[listingId]@bargo/page.tsx:105` — `오퍼 제출 (Make Offer)`
- `app@bargo/deals@bargo/[id]@bargo/page.tsx:176` — `만남 인증 (Meetup Verification)`
- `components@bargo/NegotiationStatus.tsx:72, 119` — `다시 시도 (Retry)`, `에스크로 락업 (Lock Escrow)`
- `components@bargo/WalletConnect.tsx:40` — `지갑 연결 (Wallet)`

This is a "dev comment in the UI" smell — Korean-only users see redundant English; demo filmed at Korean conf will look unfinished. Pick one. For a Korean hackathon, strip English. **Effort: 5min.**

### 4B. Error copy doesn't follow "what broke + what to do" — MEDIUM
- `app@bargo/listings@bargo/new@bargo/page.tsx:110` — `등록 실패: ${msg}` — raw error. See 2L.
- `app@bargo/offers@bargo/new@bargo/[listingId]@bargo/page.tsx:85` — same.
- `app@bargo/deals@bargo/[id]@bargo/page.tsx:85` — `락업 실패: ${msg}` — raw error.
- `app@bargo/deals@bargo/[id]@bargo/page.tsx:109` — `QR dealId가 일치하지 않습니다` — missing "어떻게 해야 하는지". Better: `다른 거래의 QR입니다. 상대방에게 현재 거래 QR을 요청하세요.`
- `app@bargo/deals@bargo/[id]@bargo/page.tsx:112` — `QR 형식이 잘못되었습니다` — same. Add action.

### 4C. Loading states — GOOD
- `components@bargo/NegotiationStatus.tsx:54-58` — `TEE 안에서 협상 중 @bargo/ 가격·조건은 암호화된 상태로 처리됩니다 — 아무도 볼 수 없습니다` **EXCELLENT** — this is on-brand and demo-friendly.
- `app@bargo/listings@bargo/[id]@bargo/page.tsx:31-39`, `app@bargo/deals@bargo/[id]@bargo/page.tsx:116-123` — generic skeleton, no text. Consider adding `매물 불러오는 중...` for the detail page skeleton.
- Button states: `등록 중... @bargo/ 제출 중... @bargo/ 연결 중...` — **GOOD**.

### 4D. CTA verbs — GOOD
- `매물 등록`, `오퍼 제출`, `에스크로 락업`, `만남 QR 생성하기`, `확인`, `다시 시도`, `노쇼 신고`. All verbs, imperative. **GOOD**.
- One exception: home page `시작하기 →` (`app@bargo/page.tsx:49`) goes to `@bargo/listings` (browsing). Fine.

### 4E. Accessibility — MEDIUM
- `components@bargo/WalletConnect.tsx:21, 37` — `aria-label` present on icon-less buttons. **GOOD**.
- `components@bargo/MeetupQR.tsx:36, 57` — QR has `aria-label`. Manual paste input has `aria-label="상대방 QR 페이로드 입력"`. **GOOD**.
- `<label htmlFor>` used consistently in forms (`listings@bargo/new@bargo/page.tsx:140, 154, 167, 193, 206, 230, 248`). **GOOD**.
- `components@bargo/ConditionInput.tsx:77` — `aria-describedby` points to hint. **GOOD**.
- `<select>` in `listings@bargo/new@bargo/page.tsx:170-181, 251-262` has label but no `aria-describedby` for the hint text below (`:263`). **LOW**.
- Header nav anchors (`app@bargo/layout.tsx:32-44`) have no `aria-label` but visible text is self-describing. **OK**.
- Bot-vs-bot animation (`components@bargo/NegotiationStatus.tsx:16-20`) has `role="status" aria-label="TEE 안에서 협상 중"` — **GOOD**, screen-reader users get the state.

### 4F. Korean copy — MEDIUM tone issues
- `app@bargo/listings@bargo/new@bargo/page.tsx:218` — `이 가격은 암호화되어 TEE로만 전송됩니다. 서버·상대방·운영자도 알 수 없습니다.` **Strong, clear.** Good.
- `app@bargo/listings@bargo/new@bargo/page.tsx:264` — `고가 매물(50만원+)은 Tier 2 이상만 오퍼 가능하도록 컨트랙트가 강제합니다.` — "강제합니다" is stiff. Natural: `컨트랙트가 막아둡니다` or `스마트 컨트랙트에서 자동으로 제한됩니다`.
- `app@bargo/deals@bargo/[id]@bargo/page.tsx:182-183` — `만남 인증 QR을 생성하세요. 서로의 QR을 스캔해야 에스크로가 릴리즈됩니다.` — "릴리즈" is dev-speak. Natural: `정산됩니다` @bargo/ `결제가 풀립니다`.
- `app@bargo/deals@bargo/[id]@bargo/page.tsx:204-206` — `24시간 내 만남 인증이 없으면 노쇼로 신고할 수 있습니다.` — OK.
- `components@bargo/NegotiationStatus.tsx:110` — `TEE attestation 서명 완료. 판매자·구매자 모두 상대방의 마지노선은 알 수 없습니다.` — mixing English tech jargon with plain Korean. Fine for crypto-audience, but the *demo voiceover* line ("TEE attestation에는 합의 결과만 서명됩니다") is stronger and should be pulled into the UI verbatim.

---

## Prioritized Fix List

| # | File | Change | Severity | Effort (min) |
|---|------|--------|----------|--------------|
| 1 | `apps@bargo/negotiation-service@bargo/src@bargo/tee@bargo/mock.ts` | Add condition-mismatch logic: if scripted seller "평일" + buyer "토요일" and no overlap, return `conditions_incompatible`. Without this, PRD §2.12 first-failure shot is impossible in mock mode. | **BLOCKER** | 30 |
| 2 | `apps@bargo/web@bargo/app@bargo/listings@bargo/new@bargo/page.tsx:79-81`, `apps@bargo/web@bargo/app@bargo/offers@bargo/new@bargo/[listingId]@bargo/page.tsx:55-57` | Capture plaintext to locals and clear state *before* `sealPrice`; or wrap clears in `finally`. Prevents leak on seal error. | HIGH | 10 |
| 3 | `apps@bargo/web@bargo/app@bargo/listings@bargo/new@bargo/page.tsx:110`, `apps@bargo/web@bargo/app@bargo/offers@bargo/new@bargo/[listingId]@bargo/page.tsx:85`, `apps@bargo/web@bargo/app@bargo/deals@bargo/[id]@bargo/page.tsx:85` | Replace `등록 실패: ${msg}` with a static message; log raw error to dev console only. Blocks plaintext leaks via Zod error messages. | HIGH | 10 |
| 4 | `apps@bargo/web@bargo/app@bargo/listings@bargo/new@bargo/page.tsx:270`, `app@bargo/listings@bargo/[id]@bargo/page.tsx:112`, `app@bargo/offers@bargo/new@bargo/[listingId]@bargo/page.tsx:179` | Fixed bottom bars: add `pb-[max(1rem,env(safe-area-inset-bottom))]` or convert to `sticky bottom-0` so iOS home-indicator and soft keyboard don't overlap. | HIGH | 20 |
| 5 | `apps@bargo/web@bargo/components@bargo/NegotiationStatus.tsx:14-45` + `tailwind.config.ts:53-66` | Amplify bot-vs-bot animation (±16-20px, add dot pulse, 3-4s timeline). Must read on-camera. | HIGH | 25 |
| 6 | `apps@bargo/web@bargo/app@bargo/listings@bargo/[id]@bargo/page.tsx:87` | Replace `<KarmaBadge tier={0} @bargo/>` with real tier read from `KarmaReader` contract (or accept a `forcedTier` dev flag for demo). Seller Tier 3 shot in PRD fails without this. | HIGH | 30 |
| 7 | `apps@bargo/web@bargo/app@bargo/offers@bargo/new@bargo/[listingId]@bargo/page.tsx` | Add a visible `<KarmaBadge tier={buyerTier} @bargo/>` for the buyer's own tier. PRD §2.12 explicitly calls out Tier 1 display. | HIGH | 10 |
| 8 | `apps@bargo/web@bargo/components@bargo/NegotiationStatus.tsx:70-73` + `app@bargo/deals@bargo/[id]@bargo/page.tsx:166` | Change `onRetry` to `router.push('@bargo/offers@bargo/new@bargo/${listingId}?bid=${previousBid}')` and pre-fill form from query params. Currently retry dumps user on listings list. | HIGH | 20 |
| 9 | `apps@bargo/web@bargo/app@bargo/listings@bargo/[id]@bargo/page.tsx:129-137` | Disable offer CTA when user's tier < required tier; show "Tier X 이상만 오퍼 가능". | HIGH | 15 |
| 10 | `apps@bargo/web@bargo/app@bargo/deals@bargo/[id]@bargo/page.tsx:109-113`, `:85` | Rewrite error toasts with actionable guidance. | MEDIUM | 10 |
| 11 | `apps@bargo/negotiation-service@bargo/src@bargo/tee@bargo/mock.ts:28-32` + `lib@bargo/format.ts:57-66` | Make mock agreed location `강남역 8번출구` and agreed time land on a Friday 19:30; test `formatMeetTime` output matches "금요일 19:30". | MEDIUM | 20 |
| 12 | `apps@bargo/web@bargo/app@bargo/listings@bargo/new@bargo/page.tsx:170-181, 251-262` | Bump `<select>` to `h-11`. | MEDIUM | 2 |
| 13 | `apps@bargo/web@bargo/app@bargo/layout.tsx:32-43` | Add `py-2 px-3` to header nav links so they reach 44pt. | MEDIUM | 2 |
| 14 | `apps@bargo/web@bargo/app@bargo/listings@bargo/new@bargo/page.tsx:217, 263`, `offers@bargo/new@bargo/[listingId]@bargo/page.tsx:147` | Bump TEE disclosure text from `text-xs` to `text-sm`, bold the money phrase. | MEDIUM | 5 |
| 15 | `apps@bargo/web@bargo/components@bargo/NegotiationStatus.tsx:66` | Consider softer copy: `협상이 성사되지 않았습니다. 조건을 조정해보세요.` (keeps axis hidden, avoids literal misinfo when real cause is no-ZOPA). | MEDIUM | 2 |
| 16 | Multiple: `매물 등록 (New Listing)` style | Strip English parentheticals for Korean-first demo. | LOW | 10 |
| 17 | `apps@bargo/web@bargo/app@bargo/listings@bargo/[id]@bargo/page.tsx:31-39`, `app@bargo/deals@bargo/[id]@bargo/page.tsx:116-123` | Add descriptive text to loading skeletons. | LOW | 5 |
| 18 | `apps@bargo/web@bargo/test@bargo/privacy.test.tsx` | Add integration test using real `NewListingPage`; assert request body to `@bargo/listing` contains no plaintext digits; assert state clear on seal-throw. | LOW | 30 |

**Total hard-fix time (rows 1-9): ~170min ≈ 2.8h. Polish (10-18): ~1h.**

---

## Demo-day Risks Not Covered in Code

- **Stage Wi-Fi latency**: Polling interval is 1s (`app@bargo/deals@bargo/[id]@bargo/page.tsx:43`). On a flaky network, `5s → agreement` can slip to 10-15s. Mitigation: bring a hotspot, cache the TEE pubkey (`api.ts:60` has 5min staleTime — good), pre-open both phones to `@bargo/listings@bargo/new` *before* recording so wallet connect happens off-camera.
- **MetaMask on mobile**: WalletConnect-via-injected is documented but on iOS Safari MetaMask extension is iffy — rehearse with Brave or MetaMask in-app browser. Demo checklist (`apps@bargo/web@bargo/README.md:21-25`) says MetaMask on Hoodi 374; test on actual phone browser stack.
- **Confetti blocking the last shot**: `app@bargo/deals@bargo/[id]@bargo/page.tsx:97-106` confetti fires from y:0.6 with 150 particles for ~3s. Fine on phone video.
- **`maximum-scale=1`** (`app@bargo/layout.tsx:21`) prevents users pinching to see small text during Q&A — consider dropping for the demo day.
- **Pretendard CDN dependency** (`app@bargo/globals.css:46`) — on-stage Wi-Fi may block jsdelivr. Fallback to `system-ui` is set, but the font shift is visible. Preflight on demo Wi-Fi.
- **Mock TEE vs real TEE**: if plan is to run mock TEE on-stage, fix #1 is mandatory. If real TEE — verify NEAR AI Cloud uptime 60 min before go-time; have the mock as backup and have the mock support condition mismatches.
- **Fastify default request logger**: encrypted blobs are serialized in request bodies; default pino may log on `debug`. Confirm log level and add pino `redact` before demo.
- **React DevTools open during stage**: close the browser devtools before demo — masked price (`PriceInput.tsx:42`) is visible as state in the fiber tree until the form is submitted.

---

## Recommended Manual Rehearsal Steps (untestable without live browser)

1. Open both phones to `@bargo/listings@bargo/new` **before** filming; prep wallet connection off-camera.
2. DevTools Network tab on laptop mirror: record a full listing → offer → settle flow. Confirm POST bodies contain only `enc*` fields, no plaintext digits, no raw Korean condition strings.
3. Film a dry run of the **fail → retry** path end-to-end; time it. If > 10s, re-tune mock delays.
4. Verify all three phones render the bot-vs-bot animation legibly after fixes (zoom in on video playback).
5. Close all browser devtools; lock phone orientation to portrait; set Do Not Disturb.
