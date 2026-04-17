# Bargo V2 — Threat Model

## Why V2 is more honest than V1

V1 described a "TEE" that was, in reality, a Python FastAPI server running on a developer laptop. It held a secp256k1 private key and self-signed EIP-712 attestations. There was no Intel TDX quote, no NVIDIA GPU evidence, and no verifiable measurement. Any claim of TEE privacy was therefore unfalsifiable — a judge had no way to verify that the LLM was running in a trusted environment, and neither did the operator.

V2 makes **NEAR AI Cloud** the trust anchor. NEAR AI Cloud runs inference inside an Intel TDX + NVIDIA GPU TEE and publishes a verifiable attestation on every inference request. Our service becomes a trusted-but-auditable orchestrator: it handles plaintext data in memory for approximately 15 seconds during negotiation, then submits the NEAR AI attestation hash on-chain and auto-purges all reservation data from the database on settlement.

This model is more honest because:
- The claim "the LLM runs in a TEE" is now independently verifiable by any judge with `node scripts/verify-attestation.mjs`.
- The claim "we don't learn your reservation price" is now bounded by an honest residual risk disclosure (see Row 2 below) instead of a false cryptographic guarantee.
- The on-chain `nearAiAttestationHash` is immutable proof that a specific NEAR AI inference occurred; substitution breaks the equality check in the verifier.

---

## Threat table

| # | Attacker | Capability | Defense | Residual risk |
|---|---|---|---|---|
| 1 | Malicious NEAR AI operator | Swaps model mid-inference; crafts arbitrary JSON response | `signed_response` binds `model`, `nonce`, and `completion_id`. Verifier re-checks TDX measurement + NVIDIA NRAS GPU evidence against pinned values. | NEAR AI compromising Intel PCS signing key (implausible; Intel PCS is a hardware root of trust) |
| 2 | Malicious service operator (turns bad after deployment) | Reads live DB; extracts plaintext reservation prices of open negotiations | Plaintext lives in DB only between offer receipt and settlement (~15 s typical, 2 min max). Auto-purge on `COMPLETED` NULLs `plaintext_min_sell` and `plaintext_seller_conditions`. | Pre-settlement in-flight snooping remains possible — **documented honestly as the primary residual risk** |
| 3 | Counterparty (buyer or seller) | Tries to learn the other side's reservation price or raw condition text | `/status/:id` returns only `agreedPrice` + `AgreedConditions` (merged result). `plaintextMinSell`/`plaintextMaxBuy` are never returned by any API endpoint. Public listing view shows `askPrice` only. | User inadvertently embeds reservation price in condition text — mitigated by UI placeholder and client-side length warning |
| 4 | Chain observer | Replays an old `nearAiAttestationHash` on a different `dealId` | `nonce = keccak256(dealId ‖ completion_id)` is embedded in the attestation bundle. Verifier step 2 re-derives and checks the match. `dealId` is `keccak256(listingId ‖ offerId)` — deterministic and collision-resistant. | Attestation for `dealId=X` can only satisfy `X`; replay to `Y` fails nonce check |
| 5 | Database breach (pre-settlement) | Full exfiltration of SQLite file during an active negotiation | Breach exposes plaintext of at most one row per unsettled deal (the attacker gets `plaintextMinSell` for deals in flight). Completed deals are already purged. | **Accepted as the honest tradeoff for removing client-side encryption.** Post-hackathon mitigation: SQLite at-rest encryption via SQLCipher. |
| 6 | Database breach (post-settlement) | Full exfiltration of SQLite file after all deals are settled | Zero reservation data present (`NULL` columns). Only settlement facts, attestation hashes, and agreed conditions are stored. | None — purge trigger makes post-settlement breach non-exploitable for price data |
| 7 | Relayer key leak | Attacker calls `settleNegotiation` with arbitrary values | Forged settlements have no backing escrow until a buyer calls `lockEscrow` with the exact `agreedPrice`. The on-chain verifier `FAIL`s for any forged `nearAiAttestationHash`. Economic loss bounded to buyer's willingness to lock escrow on a bad deal. | Post-hackathon mitigation: multisig relayer. Emergency rotation via `setAttestationRelayer` (owner-only). |
| 8 | NEAR AI downtime | Service cannot complete inference during negotiation | 12-second request budget; returns `failureReason: 'llm_timeout'` to client. No silent failure — explicit error state. | Buyer retries or cancels. No fallback LLM in V2 (honest — fallback would break the single attestation chain). |
| 9 | Malformed NEAR AI JSON output | LLM returns non-conforming structured output | `response_format: json_schema strict: true` rejects at source; secondary zod validation in `negotiate/engine.ts` treats schema failure as `llm_timeout`. | None — two-layer validation means malformed output never reaches condition matching |
| 10 | RLN sybil (spam offers) | Mass wallets submit offers to probe prices | V1 defense unchanged: `MAX_PER_EPOCH = 3` per `(nullifier, epoch)` pair on-chain. Karma tier gate requires SNT stake for offers on high-value listings. | Tier 0 users can create multiple wallets, but Karma tier requires SNT staking — economically expensive at scale |

---

## What we explicitly do NOT defend against

1. **Pre-settlement database breach** — The operator can read plaintext reservation prices during the ~15-second negotiation window. We mitigate with auto-purge; we do not eliminate this risk.

2. **User pasting reservation price into condition text** — If a user writes "I will sell for minimum 700,000 KRW" in their condition text field, that text is visible to the service operator. The UI warns against this, but enforcement is client-side only.

3. **NEAR AI's Intel and NVIDIA roots of trust** — The verifier trusts Intel PCS and NVIDIA NRAS as hardware roots of trust. If either is compromised, the attestation chain is invalid. This is an explicit track requirement assumption.

4. **Service availability during negotiation** — If the service crashes mid-negotiation before the on-chain `settleNegotiation` call, the deal is in an inconsistent state. Recovery requires manual relayer action.

5. **Honest NEAR AI MR_TD publication** — The MR_TD pin in `NEAR_AI_MR_TD` must be sourced from NEAR AI's documentation. If NEAR AI publishes an incorrect measurement, the pin provides no security. The ECDSA signature check (Row 1) still provides meaningful assurance without the MR_TD pin.
