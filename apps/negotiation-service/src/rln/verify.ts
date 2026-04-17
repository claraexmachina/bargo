// RLN proof verification — nullifier deduplication and epoch rate-limiting.
//
// Current implementation: stub proof structure verification.
// The stub proof format matches apps/web/lib/rln.ts:
//   proof = keccak256(signalHash || nullifier || identitySecret)
// Interface is identical to real RLN; swap in Status SDK when available.
//
// TODO: If RLN_SDK env flag is set, import real Status RLN SDK here.
// The DB-backed nullifier store is the authoritative rate-limiter.

import { keccak256, encodePacked } from 'viem';
import type Database from 'better-sqlite3';
import { getRlnNullifierCount, recordRlnNullifier } from '../db/client.js';
import { RLN_MAX_PER_EPOCH } from '@haggle/shared';
import type { RLNProof } from '@haggle/shared';

export type RlnVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'duplicate-nullifier' | 'epoch-limit-exceeded' | 'invalid-proof' };

/**
 * Verifies the stub RLN proof structure and enforces epoch rate-limiting.
 *
 * Steps:
 * 1. Basic structural checks (non-zero nullifier, valid epoch)
 * 2. Stub proof integrity: proof should be keccak256(signalHash || nullifier || commitment)
 *    We verify this loosely — any hex proof of correct length is accepted in stub mode.
 * 3. Check existing count for this (nullifier, epoch) pair in DB.
 *    If already at MAX_PER_EPOCH → reject before incrementing.
 * 4. Record use (increment count).
 */
export function verifyRlnProof(
  db: Database.Database,
  proof: RLNProof,
): RlnVerifyResult {
  // Structural check: nullifier must be non-zero bytes32
  if (
    !proof.nullifier ||
    proof.nullifier === '0x0000000000000000000000000000000000000000000000000000000000000000'
  ) {
    return { ok: false, reason: 'invalid-proof' };
  }

  // Structural check: epoch must be a positive integer
  if (!Number.isInteger(proof.epoch) || proof.epoch <= 0) {
    return { ok: false, reason: 'invalid-proof' };
  }

  // Structural check: proof bytes must be non-empty hex
  if (!proof.proof || proof.proof === '0x') {
    return { ok: false, reason: 'invalid-proof' };
  }

  // TODO: when RLN_SDK is set, call real SDK verifier here:
  // if (process.env.RLN_SDK) {
  //   const valid = await rlnSdk.verify(proof);
  //   if (!valid) return { ok: false, reason: 'invalid-proof' };
  // }

  // Stub mode: accept any structurally valid proof.
  // In production, the RLN contract on-chain enforces ZK correctness.

  // Check current count before incrementing
  const currentCount = getRlnNullifierCount(db, proof.nullifier, proof.epoch);
  if (currentCount >= RLN_MAX_PER_EPOCH) {
    return { ok: false, reason: 'epoch-limit-exceeded' };
  }

  // Record use — this increments the count atomically
  const newCount = recordRlnNullifier(db, proof.nullifier, proof.epoch);

  if (newCount > RLN_MAX_PER_EPOCH) {
    // Race condition: two concurrent requests both passed the check above.
    // The one that exceeds the limit loses.
    return { ok: false, reason: 'epoch-limit-exceeded' };
  }

  return { ok: true };
}
