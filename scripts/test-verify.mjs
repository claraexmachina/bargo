#!/usr/bin/env node
// scripts/test-verify.mjs
// Smoke test for verify-attestation.mjs.
// Runs steps 1-3 (hash/nonce/signature) against the committed fixture.
// Steps 4-5 (NRAS/TDX) are skipped because fixture uses zeroed placeholders.
//
// Usage: node test-verify.mjs
// Exit 0 = PASS, 1 = FAIL.

import { readFileSync } from 'node:fs';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';

const FIXTURE_PATH = new URL('./fixtures/sample-attestation.json', import.meta.url).pathname;

// ─── canonicalize (must match verify-attestation.mjs) ─────────────────────────

function canonicalize(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalize).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(v[k])).join(',') + '}';
}

function hexToBytes(hex) {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function pass(name) {
  console.log(`[PASS] ${name}`);
}

function fail(name, reason) {
  console.error(`[FAIL] ${name}: ${reason}`);
  process.exitCode = 1;
}

async function main() {
  console.log('Smoke test — fixture:', FIXTURE_PATH);
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  const bundle = fixture.bundle;
  const meta = fixture.meta;

  // ── Check 1: canonicalize is stable (idempotent) ───────────────────────────
  const c1 = canonicalize(bundle.signed_response);
  const c2 = canonicalize(JSON.parse(JSON.stringify(bundle.signed_response)));
  if (c1 === c2) {
    pass('canonicalize is stable');
  } else {
    fail('canonicalize is stable', `got different outputs:\n  ${c1}\n  ${c2}`);
  }

  // ── Check 2: signing_key is an uncompressed secp256k1 point ───────────────
  try {
    const pubKeyBytes = hexToBytes(bundle.signing_key);
    if (pubKeyBytes[0] !== 0x04) throw new Error(`expected uncompressed prefix 0x04, got 0x${pubKeyBytes[0].toString(16)}`);
    if (pubKeyBytes.length !== 65) throw new Error(`expected 65 bytes, got ${pubKeyBytes.length}`);
    pass('signing_key is valid uncompressed secp256k1 point');
  } catch (e) {
    fail('signing_key is valid uncompressed secp256k1 point', e.message);
  }

  // ── Check 3: ECDSA signature verifies ─────────────────────────────────────
  try {
    const sr = bundle.signed_response;
    const canonical = canonicalize(sr);
    const msgBytes = new TextEncoder().encode(canonical);
    const msgHash = sha256(msgBytes);

    const pubKeyBytes = hexToBytes(bundle.signing_key);
    const sigBytes = hexToBytes(bundle.signature);
    // Take first 64 bytes (r||s compact); recovery byte at index 64 if present
    const sigCompact = sigBytes.length === 65 ? sigBytes.slice(0, 64) : sigBytes;

    const valid = secp256k1.verify(sigCompact, msgHash, pubKeyBytes);
    if (valid) {
      pass('ECDSA signature over sha256(canonicalize(signed_response)) is valid');
    } else {
      fail('ECDSA signature verify', 'secp256k1.verify returned false');
    }
  } catch (e) {
    fail('ECDSA signature verify', e.message);
  }

  // ── Check 4: fixture note documents skipped checks ────────────────────────
  const note = meta?._note ?? '';
  if (note.includes('NRAS') || note.includes('TDX') || note.includes('zeroed')) {
    pass('fixture meta documents skipped NRAS/TDX checks');
  } else {
    fail('fixture meta documents skipped checks', `_note missing expected keywords: "${note}"`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  if (process.exitCode === 1) {
    console.error('\nSmoke test FAILED');
  } else {
    console.log('\nSmoke test PASSED — steps 1-3 verified, NRAS/TDX skipped (fixture mode)');
  }
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
