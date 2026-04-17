# Bargo — Attestation Verification Guide

This guide walks a judge (or any third party) through verifying that a Bargo deal used a real NEAR AI Cloud TEE inference — not a server-controlled fake.

---

## 1. Prerequisites

### Required

- **Node.js 20+** — `node --version` must print `v20.x` or higher.
- **Environment variables** (set in your shell or `.env.local`):

  ```bash
  export HOODI_RPC=https://public.hoodi.rpc.status.network
  export SERVICE_URL=https://bargo.app            # or http://localhost:3001 for local
  export BARGO_ESCROW_ADDRESS=<deployed address>  # from docs/deployments.md
  ```

- **NEAR AI `NEAR_AI_MR_TD`** (optional but recommended for full TDX pinning):

  ```bash
  export NEAR_AI_MR_TD=<TBD — confirm with NEAR AI at go-live>
  ```

  > Note: The NVIDIA ECDSA signature check (step 3) and NRAS GPU attestation check (step 4) still provide meaningful assurance even without the MR_TD pin. The pin is the final layer that ties the TDX quote to a specific NEAR AI software version.

### Optional (for Intel TDX quote verification)

Install the `dcap-qvl` Rust binary:

```bash
cargo install dcap-qvl
```

Or download a pinned release from the dcap-qvl GitHub repository. Without this binary, the verifier skips TDX quote parsing and notes the skip in the output.

---

## 2. Get a dealId from a settled Bargo deal

You need a `dealId` (a `bytes32` hex string) for a deal that has been settled on-chain.

**Option A — from the web UI:**

1. Open a Bargo deal page (e.g., `https://bargo.app/deals/0x...`).
2. When the deal is in `settled` state, the `nearAiAttestationHash` and deal ID are shown in the AttestationViewer panel.
3. Copy the `dealId`.

**Option B — from the Hoodi explorer:**

1. Go to [hoodiscan.status.network](https://hoodiscan.status.network).
2. Search for the `BargoEscrow` contract address (see `docs/deployments.md`).
3. Filter events for `NegotiationSettled`. Each emitted event includes:
   - `dealId` (indexed topic 1)
   - `listingId` (indexed topic 2)
   - `nearAiAttestationHash` (indexed topic 3)
   - `agreedPrice`, `agreedConditionsHash` (data fields)
4. Copy the `dealId` from any `NegotiationSettled` event.

---

## 3. Run the verifier

```bash
# Clone the repo (if you don't already have it)
git clone https://github.com/<org>/bargo.git
cd bargo
pnpm install   # installs scripts/node_modules

# Run
node scripts/verify-attestation.mjs --dealId 0x<your-deal-id>
```

Or verify from a saved attestation file (no network call to the contract):

```bash
node scripts/verify-attestation.mjs --file ./attestation.json
```

---

## 4. Expected output and what each check means

A fully passing run looks like:

```json
{
  "dealId": "0xabc...123",
  "verdict": "PASS",
  "checks": {
    "onchainHashMatch": true,
    "nonceBinding": true,
    "responseSignature": true,
    "nvidiaGpuAttestation": true,
    "intelTdxQuote": true,
    "mrTdPinMatch": true
  },
  "reason": null
}
```

### Check explanations

| Check | What it proves |
|---|---|
| `onchainHashMatch` | The attestation JSON served by our service hashes to exactly the value stored on-chain at settlement. Substitution after the fact breaks this. |
| `nonceBinding` | The nonce in the attestation equals `keccak256(dealId ‖ completion_id)`. This binds the attestation to a specific NEAR AI inference ID, preventing replay of one deal's attestation onto another deal. |
| `responseSignature` | NEAR AI's TEE signed the `signed_response` object with its in-TEE secp256k1 key. The signature is verified against the `signing_key` in the bundle. A forged or tampered response fails this check. |
| `nvidiaGpuAttestation` | The `gpu_evidence` blob is accepted by NVIDIA NRAS (`https://nras.attestation.nvidia.com/v3/attest/gpu`). This proves the inference ran on a genuine NVIDIA GPU in a verified state. |
| `intelTdxQuote` | The `quote` blob is a valid Intel TDX quote signed by Intel PCS. This proves the code ran inside a genuine Intel TDX enclave. Requires `dcap-qvl`. |
| `mrTdPinMatch` | The `MR_TD` measurement extracted from the TDX quote matches the pinned value of NEAR AI's known software image. This prevents NEAR AI from running different code than what they publish. |

---

## 5. Troubleshooting common failures

### `ONCHAIN_HASH_MISMATCH`

The attestation JSON served by the service does not match the hash stored on-chain.

- Confirm you are pointed at the correct `SERVICE_URL` and `BARGO_ESCROW_ADDRESS`.
- The hash on-chain is canonical: `keccak256(alphabetically-sorted JSON, no whitespace, UTF-8)`. If you modified the JSON file locally, re-download it.

### `NONCE_MISMATCH`

The `nonce` field in `signed_response` does not equal `keccak256(dealId ‖ completion_id)`.

- Check that the `dealId` you supplied matches the deal in the attestation bundle.
- A mismatch here means the attestation was generated for a different deal.

### `SIG_INVALID`

ECDSA verification of `signed_response` failed.

- The bundle's `signature` does not correspond to the `signing_key` over the canonical `signed_response`.
- This indicates tampering with either the signature or the response body.

### `NRAS_FAIL`

NVIDIA NRAS rejected the `gpu_evidence`.

- Check network access to `https://nras.attestation.nvidia.com/v3/attest/gpu`.
- The GPU evidence may have expired (typical NRAS freshness window is 24 hours).

### `dcap-qvl not installed` (warning, not failure)

Install with `cargo install dcap-qvl`. Without it, `intelTdxQuote` is reported as skipped, but the ECDSA + NRAS checks still run.

### `BARGO_ESCROW_ADDRESS env var is required`

Set `BARGO_ESCROW_ADDRESS` to the deployed contract address (see `docs/deployments.md`).

---

## 6. NEAR AI documentation and expected values

- NEAR AI Cloud API: `https://cloud-api.near.ai/v1`
- Attestation endpoint: `GET /v1/attestation/report?model=qwen3-30b&nonce=0x...&signing_algo=ecdsa`
- NEAR AI model used by Bargo: `qwen3-30b`
- NVIDIA NRAS endpoint: `https://nras.attestation.nvidia.com/v3/attest/gpu`

**Pinned MR_TD value:**

```
NEAR_AI_MR_TD=<TBD — confirm with NEAR AI at go-live>
```

This value must be sourced from NEAR AI's official documentation or a trusted attestation report from their TEE image. The NVIDIA ECDSA signature check (step 3) and NRAS GPU evidence check (step 4) remain valid independently — MR_TD pinning is the final binding between the TDX quote and NEAR AI's specific code image.

---

## 7. Smoke test (no network required)

Run the committed fixture smoke test to verify the verifier itself works correctly:

```bash
node scripts/test-verify.mjs
```

Expected output:

```
Smoke test — fixture: .../scripts/fixtures/sample-attestation.json
[PASS] canonicalize is stable
[PASS] signing_key is valid uncompressed secp256k1 point
[PASS] ECDSA signature over sha256(canonicalize(signed_response)) is valid
[PASS] fixture meta documents skipped NRAS/TDX checks

Smoke test PASSED — steps 1-3 verified, NRAS/TDX skipped (fixture mode)
```
