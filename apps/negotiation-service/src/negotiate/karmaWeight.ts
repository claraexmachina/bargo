// Karma-weighted price split within ZOPA.
// Ported from services/tee/haggle_tee/karma_weight.py (Python → TypeScript).
//
// Per PRD §2.4 US-5 and §2.8:
//   weight = 0.5 + 0.05 * (seller_tier - buyer_tier)
//   clamped to [0.35, 0.65]
//
// weight > 0.5 → seller-favourable (agreedPrice closer to buyerMax)
// weight < 0.5 → buyer-favourable (agreedPrice closer to sellerMin)
//
// agreedPrice = floor(sellerMin + (buyerMax - sellerMin) * weight)

import type { KarmaTier } from '@haggle/shared';

/**
 * Compute seller-favourable weight in [0.35, 0.65].
 * Pure function — no I/O.
 */
export function karmaWeight(sellerTier: KarmaTier, buyerTier: KarmaTier): number {
  const raw = 0.5 + 0.05 * (sellerTier - buyerTier);
  return Math.max(0.35, Math.min(0.65, raw));
}

/**
 * Compute agreed price using karma-weighted split within ZOPA.
 * Uses bigint arithmetic to avoid floating-point precision loss on large wei values.
 *
 * @param sellerMinWei - seller's minimum acceptable price (wei, as bigint)
 * @param buyerMaxWei  - buyer's maximum acceptable price (wei, as bigint)
 * @param sellerTier   - seller's karma tier (0..3)
 * @param buyerTier    - buyer's karma tier (0..3)
 * @returns agreed price in wei (floored)
 */
export function computeAgreedPrice(
  sellerMinWei: bigint,
  buyerMaxWei: bigint,
  sellerTier: KarmaTier,
  buyerTier: KarmaTier,
): bigint {
  const weight = karmaWeight(sellerTier, buyerTier);
  // Use integer arithmetic: multiply by 10000 to preserve 4 decimal places
  const SCALE = 10_000n;
  const weightScaled = BigInt(Math.round(weight * Number(SCALE)));
  const zopa = buyerMaxWei - sellerMinWei;
  return sellerMinWei + (zopa * weightScaled) / SCALE;
}
