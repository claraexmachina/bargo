import { KarmaBadge } from '@/components/KarmaBadge';
import type { KarmaTier, ListingPublic } from '@bargo/shared';
import Link from 'next/link';

interface ListingCardProps {
  listing: ListingPublic;
}

const TIER_REQUIRED_LABEL: Record<KarmaTier, string> = {
  0: 'Anyone',
  1: 'Regular+',
  2: 'Trusted+',
  3: 'Elite only',
};

export function ListingCard({ listing }: ListingCardProps) {
  return (
    <Link
      href={`/listings/${listing.id}`}
      className="block focus:outline-none focus-visible:ring-4 focus-visible:ring-bargo-accent group"
    >
      <div className="pixel-box h-full transition-transform group-hover:-translate-x-[1px] group-hover:-translate-y-[1px] group-hover:shadow-pixel-lg">
        {listing.itemMeta.images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.itemMeta.images[0]}
            alt={listing.itemMeta.title}
            className="h-40 w-full object-cover border-b-4 border-bargo-ink"
          />
        ) : (
          <div className="h-40 w-full bg-bargo-mint border-b-4 border-bargo-ink flex items-center justify-center font-pixel text-xs opacity-50">
            NO IMG
          </div>
        )}
        <div className="p-4 space-y-3">
          <h3 className="font-mono font-black uppercase text-sm tracking-wide line-clamp-2">
            {listing.itemMeta.title}
          </h3>
          <div data-testid="sealed-bid-badge" className="pixel-pill bg-bargo-accent">
            Sealed · Tier {listing.requiredKarmaTier}+ (
            {TIER_REQUIRED_LABEL[listing.requiredKarmaTier]})
          </div>
          <p className="text-xs leading-snug opacity-80 line-clamp-2">
            {listing.itemMeta.description}
          </p>
        </div>
        <div className="flex items-center justify-between border-t-4 border-bargo-ink p-3">
          <KarmaBadge tier={0} showLabel={false} />
          <span className="font-mono text-[10px] uppercase tracking-widest opacity-60">Open →</span>
        </div>
      </div>
    </Link>
  );
}
