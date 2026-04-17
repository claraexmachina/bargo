#!/usr/bin/env node
// scripts/verify-attestation.mjs
// Judge-facing verifier for Bargo V2 NEAR AI attestation bundles.
//
// Usage:
//   node verify-attestation.mjs --dealId 0x<bytes32>
//   node verify-attestation.mjs --file ./attestation.json
//
// Environment (all optional — defaults shown):
//   HOODI_RPC        https://public.hoodi.rpc.status.network
//   NVIDIA_NRAS_URL  https://nras.attestation.nvidia.com/v3/attest/gpu
//   SERVICE_URL      https://bargo.app
//   NEAR_AI_MR_TD    (pinned TDX measurement — skipped if unset)
//   BARGO_ESCROW_ADDRESS  (required for --dealId onchain lookup)

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { http, createPublicClient, keccak256 } from 'viem';

// RFC 8785 canonicalize — same package used by the negotiation service's attestation.ts.
// This ensures the hash computed here matches the on-chain hash exactly, including
// for any future non-integer or non-ASCII fields in the bundle.
import canonicalizeLib from 'canonicalize';

// ─── constants ───────────────────────────────────────────────────────────────

const HOODI_RPC = process.env.HOODI_RPC ?? 'https://public.hoodi.rpc.status.network';
const NRAS_URL = process.env.NVIDIA_NRAS_URL ?? 'https://nras.attestation.nvidia.com/v3/attest/gpu';
const SERVICE_BASE = process.env.SERVICE_URL ?? 'https://bargo.app';
const EXPECTED_MR_TD = process.env.NEAR_AI_MR_TD;
const ESCROW_ADDRESS = process.env.BARGO_ESCROW_ADDRESS;

// Minimal ABI — only the event we need for log lookup.
const BARGO_ESCROW_ABI = [
  {
    type: 'event',
    name: 'NegotiationSettled',
    inputs: [
      { name: 'dealId', type: 'bytes32', indexed: true },
      { name: 'listingId', type: 'bytes32', indexed: true },
      { name: 'offerId', type: 'bytes32', indexed: false },
      { name: 'agreedPrice', type: 'uint256', indexed: false },
      { name: 'agreedConditionsHash', type: 'bytes32', indexed: false },
      { name: 'nearAiAttestationHash', type: 'bytes32', indexed: true },
    ],
  },
];

// ─── canonicalize ─────────────────────────────────────────────────────────────
// Uses the 'canonicalize' npm package (RFC 8785 JCS) — same as the negotiation
// service's attestation.ts producer. This is the authoritative canonicalization.

function canonicalize(v) {
  const result = canonicalizeLib(v);
  if (result === undefined) throw new Error('canonicalize returned undefined');
  return result;
}

// ─── arg parsing ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const dealIdx = args.indexOf('--dealId');
  const fileIdx = args.indexOf('--file');
  if (dealIdx !== -1 && fileIdx !== -1) {
    throw new Error('--dealId and --file are mutually exclusive');
  }
  if (dealIdx !== -1) {
    const dealId = args[dealIdx + 1];
    if (!dealId || !dealId.startsWith('0x')) throw new Error('--dealId must be 0x<bytes32>');
    return { dealId, file: null };
  }
  if (fileIdx !== -1) {
    const file = args[fileIdx + 1];
    if (!file) throw new Error('--file requires a path argument');
    return { dealId: null, file };
  }
  throw new Error('Usage: verify-attestation.mjs --dealId 0x<bytes32> | --file <path>');
}

// ─── data fetching ────────────────────────────────────────────────────────────

async function fetchAttestation(dealId) {
  const url = `${SERVICE_BASE}/attestation/${dealId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json();
}

async function fetchOnchainAttestationHash(dealId) {
  if (!ESCROW_ADDRESS) {
    throw new Error('BARGO_ESCROW_ADDRESS env var is required for --dealId mode');
  }
  const client = createPublicClient({ transport: http(HOODI_RPC) });
  const logs = await client.getContractEvents({
    address: ESCROW_ADDRESS,
    abi: BARGO_ESCROW_ABI,
    eventName: 'NegotiationSettled',
    args: { dealId },
    fromBlock: 0n,
  });
  if (logs.length === 0)
    throw new Error(`DEAL_NOT_SETTLED — no NegotiationSettled log for dealId=${dealId}`);
  return logs[0].args.nearAiAttestationHash;
}

// ─── TDX quote verification (shell-out) ───────────────────────────────────────

function runDcapQvl(quoteHex) {
  try {
    execSync('dcap-qvl --version', { stdio: 'ignore' });
  } catch {
    return { skipped: true, reason: 'skipped — install with: cargo install dcap-qvl' };
  }
  try {
    const out = execSync(`dcap-qvl verify --quote ${quoteHex}`, { encoding: 'utf8' });
    const parsed = JSON.parse(out);
    return { skipped: false, ok: parsed.status === 'OK', mr_td: parsed.mr_td, raw: parsed };
  } catch (e) {
    return { skipped: false, ok: false, reason: e.message };
  }
}

// ─── NVIDIA NRAS ──────────────────────────────────────────────────────────────

async function checkNras(gpuEvidence) {
  try {
    const res = await fetch(NRAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidence: gpuEvidence }),
    });
    const body = await res.json();
    return { ok: body.verdict === 'PASS', raw: body };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  let args;
  try {
    args = parseArgs();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  // Load bundle
  let bundle;
  let dealId;
  if (args.file) {
    const parsed = JSON.parse(readFileSync(args.file, 'utf8'));
    // Support both raw bundle and fixture wrapper (with meta wrapper)
    bundle = parsed.bundle ?? parsed;
    dealId = parsed.meta?.dealId ?? args.dealId ?? null;
  } else {
    dealId = args.dealId;
    bundle = await fetchAttestation(dealId);
  }

  const checks = {};
  let reason = null;
  let verdict = 'PASS';

  function fail(code) {
    reason = reason ?? code;
    verdict = 'FAIL';
  }

  // ── Step 1: onchain hash match ───────────────────────────────────────────────
  if (args.dealId && !args.file) {
    try {
      const onchainHash = await fetchOnchainAttestationHash(dealId);
      const canonical = canonicalize(bundle);
      const bundleBytes = new TextEncoder().encode(canonical);
      const computed = keccak256(bundleBytes);
      const match = computed.toLowerCase() === onchainHash.toLowerCase();
      checks.onchainHashMatch = match;
      if (!match) fail('ONCHAIN_HASH_MISMATCH');
    } catch (e) {
      checks.onchainHashMatch = false;
      fail('ONCHAIN_LOOKUP_FAILED');
      console.warn(`[warn] onchain lookup failed: ${e.message}`);
    }
  } else {
    checks.onchainHashMatch = 'skipped — use --dealId for onchain verification';
  }

  // ── Step 2: nonce binding ────────────────────────────────────────────────────
  if (dealId) {
    const sr = bundle.signed_response;
    const dealIdBytes = hexToBytes(dealId);
    const completionBytes = new TextEncoder().encode(sr.completion_id);
    const combined = new Uint8Array(dealIdBytes.length + completionBytes.length);
    combined.set(dealIdBytes, 0);
    combined.set(completionBytes, dealIdBytes.length);
    const expectedNonce = keccak256(combined);
    checks.nonceBinding = expectedNonce.toLowerCase() === sr.nonce.toLowerCase();
    if (!checks.nonceBinding) fail('NONCE_MISMATCH');
  } else {
    checks.nonceBinding = 'skipped — dealId not provided';
  }

  // ── Step 3: signed_response ECDSA signature ───────────────────────────────────
  try {
    const sr = bundle.signed_response;
    const canonical = canonicalize(sr);
    const msgBytes = new TextEncoder().encode(canonical);
    const msgHash = sha256(msgBytes);

    // signing_key is uncompressed 0x04... (65 bytes)
    const pubKeyBytes = hexToBytes(bundle.signing_key);
    // signature is compact r||s + recovery byte (65 bytes), or just r||s (64 bytes)
    const sigBytes = hexToBytes(bundle.signature);
    // Use compact r||s (first 64 bytes) for verify — recovery byte is not needed for verification
    const sigCompact = sigBytes.length === 65 ? sigBytes.slice(0, 64) : sigBytes;

    // secp256k1.verify expects (sig, msgHash, pubKey) — pubKey as uncompressed
    const valid = secp256k1.verify(sigCompact, msgHash, pubKeyBytes);
    checks.responseSignature = valid;
    if (!valid) fail('SIG_INVALID');
  } catch (e) {
    checks.responseSignature = false;
    fail('SIG_VERIFY_ERROR');
    console.warn(`[warn] signature verify error: ${e.message}`);
  }

  // ── Step 4: NVIDIA NRAS ────────────────────────────────────────────────────────
  // Skip for zeroed gpu_evidence (fixture/test mode)
  const isZeroEvidence =
    bundle.gpu_evidence === `0x${'00'.repeat(bundle.gpu_evidence.length / 2 - 1)}`;
  if (isZeroEvidence) {
    checks.nvidiaGpuAttestation = 'skipped — zeroed gpu_evidence (fixture/test mode)';
  } else {
    const nrasResult = await checkNras(bundle.gpu_evidence);
    checks.nvidiaGpuAttestation = nrasResult.ok;
    if (!nrasResult.ok) {
      fail('NRAS_FAIL');
      console.warn(`[warn] NRAS response: ${JSON.stringify(nrasResult.raw ?? nrasResult.reason)}`);
    }
  }

  // ── Step 5: Intel TDX quote ────────────────────────────────────────────────────
  const isZeroQuote = bundle.quote === `0x${'00'.repeat(bundle.quote.length / 2 - 1)}`;
  if (isZeroQuote) {
    checks.intelTdxQuote = 'skipped — zeroed quote (fixture/test mode)';
    checks.mrTdPinMatch = 'skipped — zeroed quote (fixture/test mode)';
  } else {
    const tdx = runDcapQvl(bundle.quote);
    if (tdx.skipped) {
      checks.intelTdxQuote = 'skipped — dcap-qvl not installed';
      checks.mrTdPinMatch = 'skipped — dcap-qvl not installed';
      console.warn('[warn] dcap-qvl not found. Install with: cargo install dcap-qvl');
    } else {
      checks.intelTdxQuote = tdx.ok;
      if (!tdx.ok) fail('TDX_QUOTE_INVALID');

      if (EXPECTED_MR_TD) {
        checks.mrTdPinMatch = tdx.mr_td?.toLowerCase() === EXPECTED_MR_TD.toLowerCase();
        if (!checks.mrTdPinMatch) fail('MR_TD_MISMATCH');
      } else {
        checks.mrTdPinMatch = 'skipped — NEAR_AI_MR_TD not set (set env var to enable pinning)';
        console.warn(
          '[warn] NEAR_AI_MR_TD not set — MR_TD pinning check skipped. ECDSA + NRAS checks still provide meaningful assurance.',
        );
      }
    }
  }

  // ── Output ─────────────────────────────────────────────────────────────────────
  const output = {
    dealId: dealId ?? '(from file)',
    verdict,
    checks,
    reason,
  };

  console.log(JSON.stringify(output, null, 2));
  process.exit(verdict === 'PASS' ? 0 : 1);
}

// ─── utils ─────────────────────────────────────────────────────────────────────

function hexToBytes(hex) {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
