'use client';

import { KarmaBadge } from '@/components/KarmaBadge';
import { UserKarma } from '@/components/UserKarma';
import { WalletConnect } from '@/components/WalletConnect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useListing } from '@/lib/api';
import { findDemoListing } from '@/lib/demo-listings';
import { formatKRW } from '@/lib/format';
import type { Address, KarmaTier, ListingId } from '@bargo/shared';
import { ADDRESSES, karmaReaderAbi } from '@bargo/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';
import { useAccount, useReadContract } from 'wagmi';

const REQUIRED_TIER_LABEL: Record<KarmaTier, string> = {
  0: 'Anyone can offer',
  1: 'Regular (Tier 1) or above',
  2: 'Trusted (Tier 2) or above',
  3: 'Elite (Tier 3) only',
};

// Demo tier map — used when KarmaReader is not yet deployed (matches Seed.s.sol)
const DEMO_TIER_MAP: Record<string, KarmaTier> = {
  '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266': 3,
  '0x70997970c51812dc3a010c7d01b50e0d17dc79c8': 1,
  '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc': 0,
};

const KARMA_READER_ADDRESS = (ADDRESSES[374] as { karmaReader?: Address } | undefined)?.karmaReader;

const LISTING_ID_RE = /^0x[0-9a-fA-F]{64}$/;

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = params.id as string;
  const isValidId = LISTING_ID_RE.test(rawId);
  const listingId = rawId as ListingId;
  const { address } = useAccount();

  const { data: fetchedListing, isLoading } = useListing(isValidId ? listingId : null);
  // Fall back to local demo data when the negotiation service isn't reachable —
  // keeps the UI browsable in frontend-only demo mode.
  const listing = isValidId ? (fetchedListing ?? findDemoListing(listingId)) : undefined;

  if (!isValidId) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-4xl" aria-hidden="true">
          🤔
        </p>
        <p className="text-muted-foreground">That listing id doesn't look right.</p>
        <Button asChild variant="outline">
          <Link href="/listings">Back to listings</Link>
        </Button>
      </div>
    );
  }

  // Read buyer's own Karma tier for offer-button gating
  const { data: contractBuyerTier } = useReadContract({
    address: KARMA_READER_ADDRESS,
    abi: karmaReaderAbi,
    functionName: 'getTier',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!KARMA_READER_ADDRESS },
  });
  const myTier: KarmaTier =
    contractBuyerTier !== undefined
      ? (Number(contractBuyerTier) as KarmaTier)
      : (DEMO_TIER_MAP[address?.toLowerCase() ?? ''] ?? 0);

  if (isLoading && !listing) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded w-2/3" />
        <div className="h-40 bg-muted rounded" />
        <div className="h-20 bg-muted rounded" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-muted-foreground">Listing not found.</p>
        <Button asChild variant="outline">
          <Link href="/listings">Back to listings</Link>
        </Button>
      </div>
    );
  }

  const isSeller = address?.toLowerCase() === listing.seller.toLowerCase();
  const meetsKarmaTier = myTier >= listing.requiredKarmaTier;
  const canOffer = !isSeller && !!address && meetsKarmaTier;

  return (
    <div className="space-y-6 pb-24">
      {/* Image */}
      {listing.itemMeta.images[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={listing.itemMeta.images[0]}
          alt={listing.itemMeta.title}
          className="w-full h-56 object-cover rounded-xl"
        />
      )}

      {/* Title + status */}
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold leading-tight">{listing.itemMeta.title}</h1>
        <Badge variant={listing.status === 'open' ? 'default' : 'secondary'}>
          {listing.status === 'open' ? 'For sale' : listing.status}
        </Badge>
      </div>

      {/* Sealed-bid notice (no public price) */}
      <div className="inline-flex items-center rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary">
        Sealed bid · no public price · the only price ever revealed is the agreed settlement
      </div>

      {/* Seller info */}
      <Card>
        <CardContent className="pt-4 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Seller</p>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs bg-muted px-2 py-1 rounded">
              {listing.seller.slice(0, 10)}...{listing.seller.slice(-4)}
            </code>
            <UserKarma address={listing.seller} />
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      <Card>
        <CardContent className="pt-4 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Description</p>
          <p className="text-sm">{listing.itemMeta.description || '—'}</p>
        </CardContent>
      </Card>

      {/* Karma requirement */}
      <Card>
        <CardContent className="pt-4 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Offer requirement</p>
          <p className="text-sm">{REQUIRED_TIER_LABEL[listing.requiredKarmaTier]}</p>
          <p className="text-xs text-muted-foreground">
            The contract will reject offers that don't meet the required tier.
          </p>
        </CardContent>
      </Card>

      {/* Bottom action bar */}
      <div
        className="sticky bottom-0 bg-background/95 backdrop-blur border-t p-4 flex gap-3"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <Button variant="outline" onClick={() => router.push('/listings')} className="flex-1">
          Back
        </Button>

        {!address ? (
          <div className="flex-1">
            <WalletConnect />
          </div>
        ) : isSeller ? (
          <Button disabled className="flex-1">
            Your listing
          </Button>
        ) : listing.status !== 'open' ? (
          <Button disabled className="flex-1">
            Negotiation closed
          </Button>
        ) : !meetsKarmaTier ? (
          <div className="flex-1 space-y-1">
            <Button disabled className="w-full">
              Tier {listing.requiredKarmaTier}+ required to offer
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              You are Tier {myTier}. Earn more Karma to reach Tier {listing.requiredKarmaTier}.
            </p>
          </div>
        ) : (
          <Button asChild className="flex-1" size="lg">
            <Link href={`/offers/new/${listing.id}`}>Make offer →</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
