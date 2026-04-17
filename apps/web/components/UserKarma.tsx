'use client';

/**
 * UserKarma — reads a wallet's Karma tier from the KarmaReader contract.
 *
 * Fallback demo map (used when ADDRESSES[374].karmaReader is not yet deployed):
 *   Alice (Seed.s.sol ALICE_ADDRESS) → tier 3
 *   Bob   (Seed.s.sol BOB_ADDRESS)   → tier 1
 *   Eve   (Seed.s.sol EVE_ADDRESS)   → tier 0
 *   All others                        → tier 0
 *
 * The demo addresses are read from env vars at the time Seed.s.sol is run.
 * We use the well-known Hardhat/Anvil derivation order as defaults for demo.
 */

import { useReadContract } from 'wagmi';
import { karmaReaderAbi, ADDRESSES } from '@bargo/shared';
import type { KarmaTier, Address } from '@bargo/shared';
import { KarmaBadge } from '@/components/KarmaBadge';

// Deterministic demo tier map keyed by lowercase address.
// Update these to match the actual addresses from your Seed.s.sol run.
const DEMO_TIER_MAP: Record<string, KarmaTier> = {
  // Populated by Seed.s.sol: alice → 3, bob → 1, eve → 0
  // Replace with real addresses from .env when available.
  '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266': 3, // Hardhat account[0] (Alice)
  '0x70997970c51812dc3a010c7d01b50e0d17dc79c8': 1, // Hardhat account[1] (Bob)
  '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc': 0, // Hardhat account[2] (Eve)
};

const KARMA_READER_ADDRESS = (ADDRESSES[374] as { karmaReader?: Address } | undefined)
  ?.karmaReader;

interface UserKarmaProps {
  address: Address | undefined;
  showLabel?: boolean;
  className?: string;
}

/**
 * Renders a KarmaBadge for the given address by reading the KarmaReader contract.
 * Falls back to DEMO_TIER_MAP if the contract is not yet deployed.
 */
export function UserKarma({ address, showLabel, className }: UserKarmaProps) {
  const { data: contractTier } = useReadContract({
    address: KARMA_READER_ADDRESS,
    abi: karmaReaderAbi,
    functionName: 'getTier',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!KARMA_READER_ADDRESS },
  });

  if (!address) return null;

  let tier: KarmaTier;
  if (contractTier !== undefined) {
    tier = (Number(contractTier) as KarmaTier);
  } else {
    tier = DEMO_TIER_MAP[address.toLowerCase()] ?? 0;
  }

  return <KarmaBadge tier={tier} showLabel={showLabel ?? true} className={className} />;
}
