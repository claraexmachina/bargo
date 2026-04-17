// Attestation unit tests — fixture-based hash verification + disk I/O.

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DealId, NearAiAttestationBundle } from '@bargo/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  canonicalizeBundle,
  computeNonce,
  hashBundle,
  loadAttestationBundle,
  saveAttestationBundle,
} from '../src/nearai/attestation.js';

// --- Fixture ---
const FIXTURE_BUNDLE: NearAiAttestationBundle = {
  quote: '0xdeadbeef',
  gpu_evidence: '0xcafebabe',
  signing_key: `0x04${'ab'.repeat(32)}`,
  signed_response: {
    model: 'qwen3-30b',
    nonce: `0x${'aa'.repeat(32)}`,
    completion_id: 'chatcmpl-fixture-001',
    timestamp: 1_713_312_345,
  },
  signature: `0x${'ff'.repeat(32)}`,
};

// Golden values computed from the fixture:
// canonicalize sorts keys alphabetically per RFC 8785
// gpu_evidence < quote < signature < signed_response < signing_key
// signed_response keys: completion_id < model < nonce < timestamp
const EXPECTED_CANONICAL = `{"gpu_evidence":"0xcafebabe","quote":"0xdeadbeef","signature":"0x${'ff'.repeat(32)}","signed_response":{"completion_id":"chatcmpl-fixture-001","model":"qwen3-30b","nonce":"0x${'aa'.repeat(32)}","timestamp":1713312345},"signing_key":"0x04${'ab'.repeat(32)}"}`;

describe('canonicalizeBundle', () => {
  it('produces RFC 8785 canonical JSON (sorted keys, no whitespace)', () => {
    const canonical = canonicalizeBundle(FIXTURE_BUNDLE);
    expect(canonical).toBe(EXPECTED_CANONICAL);
  });

  it('produces the same output regardless of input key order', () => {
    // Reorder keys in the input
    const reordered: NearAiAttestationBundle = {
      signature: FIXTURE_BUNDLE.signature,
      quote: FIXTURE_BUNDLE.quote,
      signing_key: FIXTURE_BUNDLE.signing_key,
      gpu_evidence: FIXTURE_BUNDLE.gpu_evidence,
      signed_response: {
        timestamp: FIXTURE_BUNDLE.signed_response.timestamp,
        nonce: FIXTURE_BUNDLE.signed_response.nonce,
        model: FIXTURE_BUNDLE.signed_response.model,
        completion_id: FIXTURE_BUNDLE.signed_response.completion_id,
      },
    };
    expect(canonicalizeBundle(reordered)).toBe(canonicalizeBundle(FIXTURE_BUNDLE));
  });
});

describe('hashBundle', () => {
  it('produces a deterministic keccak256 hex', () => {
    const hash1 = hashBundle(FIXTURE_BUNDLE);
    const hash2 = hashBundle(FIXTURE_BUNDLE);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });
});

describe('computeNonce', () => {
  it('returns 0x-prefixed keccak256 hex', () => {
    const dealId = `0x${'01'.repeat(32)}` as DealId;
    const nonce = computeNonce(dealId, 'chatcmpl-abc');
    expect(nonce).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it('is deterministic', () => {
    const dealId = `0x${'02'.repeat(32)}` as DealId;
    const n1 = computeNonce(dealId, 'chatcmpl-xyz');
    const n2 = computeNonce(dealId, 'chatcmpl-xyz');
    expect(n1).toBe(n2);
  });

  it('differs for different dealId', () => {
    const nonce1 = computeNonce(`0x${'01'.repeat(32)}` as DealId, 'same');
    const nonce2 = computeNonce(`0x${'02'.repeat(32)}` as DealId, 'same');
    expect(nonce1).not.toBe(nonce2);
  });

  it('differs for different completionId', () => {
    const dealId = `0x${'01'.repeat(32)}` as DealId;
    const nonce1 = computeNonce(dealId, 'chatcmpl-aaa');
    const nonce2 = computeNonce(dealId, 'chatcmpl-bbb');
    expect(nonce1).not.toBe(nonce2);
  });
});

describe('saveAttestationBundle + loadAttestationBundle', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `bargo-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  });

  it('round-trips the bundle through disk', () => {
    const dealId = `0x${'03'.repeat(32)}` as DealId;
    const filePath = saveAttestationBundle(tmpDir, dealId, FIXTURE_BUNDLE);

    expect(filePath).toContain(dealId);
    expect(existsSync(filePath)).toBe(true);

    const loaded = loadAttestationBundle(tmpDir, dealId);
    expect(loaded).not.toBeNull();
    // Hash must match original
    expect(hashBundle(loaded!)).toBe(hashBundle(FIXTURE_BUNDLE));
  });

  it('loadAttestationBundle returns null for unknown dealId', () => {
    const unknownId = `0x${'ff'.repeat(32)}` as DealId;
    const result = loadAttestationBundle(tmpDir, unknownId);
    expect(result).toBeNull();
  });

  it('saved file is canonical JSON — keccak256 matches across re-reads', () => {
    const dealId = `0x${'04'.repeat(32)}` as DealId;
    saveAttestationBundle(tmpDir, dealId, FIXTURE_BUNDLE);

    const loaded1 = loadAttestationBundle(tmpDir, dealId)!;
    const loaded2 = loadAttestationBundle(tmpDir, dealId)!;
    expect(hashBundle(loaded1)).toBe(hashBundle(loaded2));
    expect(hashBundle(loaded1)).toBe(hashBundle(FIXTURE_BUNDLE));
  });
});
