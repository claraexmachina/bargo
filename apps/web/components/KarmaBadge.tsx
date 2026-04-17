'use client';

import { Badge } from '@/components/ui/badge';
import { karmaTierName } from '@/lib/format';
import type { Address, KarmaTier } from '@bargo/shared';

const TIER_VARIANT = {
  0: 'newcomer',
  1: 'regular',
  2: 'trusted',
  3: 'elite',
} as const satisfies Record<KarmaTier, 'newcomer' | 'regular' | 'trusted' | 'elite'>;

const TIER_EMOJI = {
  0: '🌱',
  1: '⭐',
  2: '💜',
  3: '👑',
} as const satisfies Record<KarmaTier, string>;

interface KarmaBadgeProps {
  tier: KarmaTier;
  showLabel?: boolean;
  className?: string | undefined;
}

export function KarmaBadge({ tier, showLabel = true, className }: KarmaBadgeProps) {
  return (
    <Badge variant={TIER_VARIANT[tier]} className={className}>
      <span aria-hidden="true">{TIER_EMOJI[tier]}</span>
      {showLabel && (
        <span className="ml-1">
          {karmaTierName(tier)} (Tier {tier})
        </span>
      )}
    </Badge>
  );
}

// Placeholder for when we have actual contract reads
// Real implementation would use:
// const { data: tier } = useReadContract({
//   address: ADDRESSES[hoodiChain.id]?.karmaReader,
//   abi: karmaReaderAbi,
//   functionName: 'getTier',
//   args: [address],
// })
interface KarmaBadgeAddressProps {
  tier: KarmaTier;
  address: Address;
  className?: string;
}

export function KarmaBadgeAddress({ tier, address: _address, className }: KarmaBadgeAddressProps) {
  // In production: read from KarmaReader contract
  // For demo: tier is passed in (read at page level)
  return <KarmaBadge tier={tier} className={className} />;
}
