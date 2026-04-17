// Chain read helpers — viem public client for Status Network Hoodi.
// Read-only. No private key needed.
//
// ABI stubs from @bargo/shared are used when available.
// When ABIs are empty arrays or calls fail, conservative defaults apply:
//   - getTier → 0 (most restrictive)
//   - canOffer → true (permissive, no blocking)
//   - getActiveNegotiations → 0

import { createPublicClient, http } from 'viem';
import { hoodiChain, karmaReaderAbi, bargoEscrowAbi } from '@bargo/shared';
import type { Address } from '@bargo/shared';
import type { KarmaTier } from '@bargo/shared';

export function createChainClient(rpcUrl: string) {
  return createPublicClient({
    chain: hoodiChain,
    transport: http(rpcUrl),
  });
}

type ChainClient = ReturnType<typeof createChainClient>;

// Check if ABI is non-empty (ABI stub = empty array; real ABI = length > 0)
function hasAbi(abi: readonly unknown[]): boolean {
  return abi.length > 0;
}

/**
 * Read on-chain Karma tier for an address.
 * Falls back to 0 (most restrictive) if ABI is empty or call fails.
 */
export async function getTier(
  client: ChainClient,
  karmaReaderAddress: Address,
  who: Address,
): Promise<KarmaTier> {
  if (!hasAbi(karmaReaderAbi)) {
    return 3; // No ABI yet — return max tier to avoid blocking dev
  }
  try {
    const tier = await client.readContract({
      address: karmaReaderAddress,
      abi: karmaReaderAbi,
      functionName: 'getTier',
      args: [who],
    });
    const t = Number(tier);
    if (t >= 0 && t <= 3) return t as KarmaTier;
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Check if an address can offer on a listing given its required karma tier.
 * KarmaReader.canOffer(who, requiredTier) — requiredTier comes from the listing row.
 * Falls back to true (permissive) if ABI is empty or call fails.
 */
export async function canOffer(
  client: ChainClient,
  karmaReaderAddress: Address,
  who: Address,
  requiredKarmaTier: KarmaTier,
): Promise<boolean> {
  if (!hasAbi(karmaReaderAbi)) {
    return true;
  }
  try {
    const result = await client.readContract({
      address: karmaReaderAddress,
      abi: karmaReaderAbi,
      functionName: 'canOffer',
      args: [who, requiredKarmaTier],
    });
    return Boolean(result);
  } catch {
    return true;
  }
}

/**
 * Count active negotiations for an address from on-chain escrow.
 * Falls back to 0 if ABI is empty or call fails.
 */
export async function getActiveNegotiations(
  client: ChainClient,
  bargoEscrowAddress: Address,
  who: Address,
): Promise<number> {
  if (!hasAbi(bargoEscrowAbi)) {
    return 0;
  }
  try {
    const count = await client.readContract({
      address: bargoEscrowAddress,
      abi: bargoEscrowAbi,
      functionName: 'activeNegotiations',
      args: [who],
    });
    return Number(count);
  } catch {
    return 0;
  }
}
