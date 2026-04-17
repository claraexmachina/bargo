// NEAR AI attestation fetch + hash computation.
//
// Canonicalization choice: `canonicalize` npm package (JSON Canonicalization Scheme, RFC 8785).
// Rationale: RFC 8785 is the standard for deterministic JSON used by JOSE/JWT ecosystems.
// The verify-attestation.mjs script (Agent D) MUST use the same canonicalize package to match
// the hash. Any hand-rolled stringify would risk key-order divergence across engines.

import { keccak256, concat, toBytes, toHex } from 'viem';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
// @ts-ignore — canonicalize has no bundled types; we assert the return type
import canonicalize from 'canonicalize';
import { nearAiAttestationBundleSchema } from '@haggle/shared';
import type { NearAiAttestationBundle, DealId } from '@haggle/shared';
import type { Hex } from '@haggle/shared';

export interface FetchAttestationOpts {
  model: string;
  dealId: DealId;
  completionId: string;
  apiKey: string;
  baseURL: string;
}

export interface FetchedAttestation {
  bundle: NearAiAttestationBundle;
  bundleHash: Hex; // keccak256(canonical(bundle))
  nonce: Hex;      // keccak256(dealId || completionId)
}

/**
 * Computes nonce = keccak256(dealId_bytes || utf8(completionId)).
 * Per PLAN_V2 §2.2 step E.
 */
export function computeNonce(dealId: DealId, completionId: string): Hex {
  const dealIdBytes = toBytes(dealId); // hex → Uint8Array
  const completionIdBytes = new TextEncoder().encode(completionId);
  return keccak256(concat([dealIdBytes, completionIdBytes]));
}

/**
 * Canonical JSON string of a bundle (RFC 8785).
 * Used both for hashing and for disk storage (deterministic round-trip).
 */
export function canonicalizeBundle(bundle: NearAiAttestationBundle): string {
  const result = canonicalize(bundle) as string | undefined;
  if (result === undefined) throw new Error('canonicalize returned undefined');
  return result;
}

/**
 * Hash a bundle using keccak256(utf8(canonical(bundle))).
 */
export function hashBundle(bundle: NearAiAttestationBundle): Hex {
  const canonical = canonicalizeBundle(bundle);
  return keccak256(toBytes(canonical));
}

/**
 * Fetch the NEAR AI attestation report for a given dealId + completionId.
 * Throws if the response shape does not match nearAiAttestationBundleSchema.
 */
export async function fetchAttestation(opts: FetchAttestationOpts): Promise<FetchedAttestation> {
  const nonce = computeNonce(opts.dealId, opts.completionId);

  const url = new URL(`${opts.baseURL}/attestation/report`);
  url.searchParams.set('model', opts.model);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('signing_algo', 'ecdsa');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`NEAR AI attestation endpoint returned ${response.status}: ${text}`);
  }

  const raw: unknown = await response.json();

  const validated = nearAiAttestationBundleSchema.safeParse(raw);
  if (!validated.success) {
    const diff = JSON.stringify(validated.error.issues, null, 2);
    throw new Error(`NEAR AI attestation bundle schema mismatch:\n${diff}\nRaw: ${JSON.stringify(raw)}`);
  }

  const bundle = validated.data;
  const bundleHash = hashBundle(bundle);

  return { bundle, bundleHash, nonce };
}

/**
 * Persist attestation bundle to disk at ./data/attestations/<dealId>.json.
 * Returns the file path.
 */
export function saveAttestationBundle(
  attestationDir: string,
  dealId: DealId,
  bundle: NearAiAttestationBundle,
): string {
  mkdirSync(attestationDir, { recursive: true });
  const filePath = join(attestationDir, `${dealId}.json`);
  // Store as canonical JSON for bit-reproducible hashing
  writeFileSync(filePath, canonicalizeBundle(bundle), 'utf-8');
  return filePath;
}

/**
 * Load an attestation bundle from disk. Returns null if not found.
 */
export function loadAttestationBundle(
  attestationDir: string,
  dealId: DealId,
): NearAiAttestationBundle | null {
  const filePath = join(attestationDir, `${dealId}.json`);
  if (!existsSync(filePath)) return null;
  try {
    const raw: unknown = JSON.parse(readFileSync(filePath, 'utf-8'));
    const validated = nearAiAttestationBundleSchema.safeParse(raw);
    if (!validated.success) return null;
    return validated.data;
  } catch {
    return null;
  }
}

/**
 * Phase-0 startup check: attempt a dummy attestation fetch to confirm shape matches schema.
 * Logs WARN and continues on failure (does not crash service — API key may be absent in CI).
 */
export async function runStartupAttestationCheck(opts: {
  model: string;
  apiKey: string;
  baseURL: string;
  logger: { warn: (obj: object, msg: string) => void; info: (obj: object, msg: string) => void };
}): Promise<void> {
  // Use a zero dealId + zero completionId for the dummy check
  const dummyDealId = ('0x' + '00'.repeat(32)) as DealId;
  const dummyCompletionId = 'startup-check';

  try {
    await fetchAttestation({
      model: opts.model,
      dealId: dummyDealId,
      completionId: dummyCompletionId,
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
    });
    opts.logger.info({ model: opts.model }, 'Phase-0: NEAR AI attestation shape validated');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    opts.logger.warn(
      { err: message, model: opts.model },
      'Phase-0: NEAR AI attestation check failed — proceeding anyway (check API key + endpoint)',
    );
  }
}
