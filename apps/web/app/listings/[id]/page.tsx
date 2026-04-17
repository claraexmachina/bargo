'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAccount, useReadContract } from 'wagmi';
import Link from 'next/link';
import type { ListingId, KarmaTier, Address } from '@haggle/shared';
import { karmaReaderAbi, ADDRESSES } from '@haggle/shared';
import { useListing } from '@/lib/api';
import { KarmaBadge } from '@/components/KarmaBadge';
import { UserKarma } from '@/components/UserKarma';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WalletConnect } from '@/components/WalletConnect';
import { formatKRW } from '@/lib/format';

const REQUIRED_TIER_LABEL: Record<KarmaTier, string> = {
  0: '누구나 오퍼 가능',
  1: 'Regular (Tier 1) 이상',
  2: 'Trusted (Tier 2) 이상',
  3: 'Elite (Tier 3)만',
};

// Demo tier map — used when KarmaReader is not yet deployed (matches Seed.s.sol)
const DEMO_TIER_MAP: Record<string, KarmaTier> = {
  '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266': 3,
  '0x70997970c51812dc3a010c7d01b50e0d17dc79c8': 1,
  '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc': 0,
};

const KARMA_READER_ADDRESS = (ADDRESSES[374] as { karmaReader?: Address } | undefined)
  ?.karmaReader;

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const listingId = params['id'] as ListingId;
  const { address } = useAccount();

  const { data: listing, isLoading, error } = useListing(listingId);

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
      : DEMO_TIER_MAP[address?.toLowerCase() ?? ''] ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded w-2/3" />
        <div className="h-40 bg-muted rounded" />
        <div className="h-20 bg-muted rounded" />
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-muted-foreground">매물을 찾을 수 없습니다.</p>
        <Button asChild variant="outline">
          <Link href="/listings">목록으로</Link>
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
          {listing.status === 'open' ? '판매중' : listing.status}
        </Badge>
      </div>

      {/* Price */}
      <p className="text-3xl font-bold text-primary">{formatKRW(listing.askPrice)}</p>

      {/* Seller info */}
      <Card>
        <CardContent className="pt-4 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">판매자 (Seller)</p>
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
          <p className="text-sm font-medium text-muted-foreground">설명</p>
          <p className="text-sm">{listing.itemMeta.description || '—'}</p>
        </CardContent>
      </Card>

      {/* Karma requirement */}
      <Card>
        <CardContent className="pt-4 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">오퍼 조건 (Offer Requirement)</p>
          <p className="text-sm">{REQUIRED_TIER_LABEL[listing.requiredKarmaTier]}</p>
          <p className="text-xs text-muted-foreground">
            요구 티어를 충족하지 못하면 컨트랙트가 거부합니다.
          </p>
        </CardContent>
      </Card>

      {/* Bottom action bar */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t p-4 flex gap-3" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <Button variant="outline" onClick={() => router.back()} className="flex-1">
          뒤로
        </Button>

        {!address ? (
          <div className="flex-1">
            <WalletConnect />
          </div>
        ) : isSeller ? (
          <Button disabled className="flex-1">
            내 매물
          </Button>
        ) : listing.status !== 'open' ? (
          <Button disabled className="flex-1">
            협상 종료
          </Button>
        ) : !meetsKarmaTier ? (
          <div className="flex-1 space-y-1">
            <Button disabled className="w-full">
              Tier {listing.requiredKarmaTier} 이상만 오퍼 가능
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              현재 Tier {myTier}입니다. Karma를 쌓아 Tier {listing.requiredKarmaTier}에 도달하면 오퍼할 수 있어요.
            </p>
          </div>
        ) : (
          <Button
            asChild
            className="flex-1"
            size="lg"
          >
            <Link href={`/offers/new/${listing.id}`}>오퍼하기 →</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
