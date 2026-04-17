import { KarmaBadge } from '@/components/KarmaBadge';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { formatKRW } from '@/lib/format';
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
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
    >
      <Card className="h-full hover:border-primary/50 transition-colors">
        {listing.itemMeta.images[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.itemMeta.images[0]}
            alt={listing.itemMeta.title}
            className="h-40 w-full rounded-t-lg object-cover"
          />
        )}
        <CardContent className="pt-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold line-clamp-2">{listing.itemMeta.title}</h3>
          </div>
          <p className="text-xl font-bold text-primary">{formatKRW(listing.askPrice)}</p>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {listing.itemMeta.description}
          </p>
        </CardContent>
        <CardFooter className="flex items-center justify-between pt-0">
          <KarmaBadge tier={listing.seller.slice(0, 2) === '0x' ? 0 : 0} showLabel={false} />
          <span className="text-xs text-muted-foreground">
            Required tier: {TIER_REQUIRED_LABEL[listing.requiredKarmaTier]}
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
}
