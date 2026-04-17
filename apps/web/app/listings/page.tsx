// Listings page — RSC. Fetches open listings from the negotiation service.
// Falls back to a local demo fixture if the service is unreachable (dev without backend).
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ListingCard } from '@/components/ListingCard';
import type { ListingPublic } from '@haggle/shared';

async function fetchListings(): Promise<ListingPublic[]> {
  // NEXT_PUBLIC_NEGOTIATION_SERVICE_URL is the single env var used across the app.
  // On the server NEGOTIATION_SERVICE_URL can override it (private, server-only).
  const serviceUrl =
    process.env.NEGOTIATION_SERVICE_URL ?? process.env.NEXT_PUBLIC_NEGOTIATION_SERVICE_URL ?? '';

  if (!serviceUrl) {
    return DEMO_LISTINGS;
  }

  try {
    const res = await fetch(`${serviceUrl}/listings`, { next: { revalidate: 30 } });
    if (!res.ok) throw new Error(`${res.status}`);
    const body = (await res.json()) as { listings: ListingPublic[] };
    return body.listings.length > 0 ? body.listings : DEMO_LISTINGS;
  } catch {
    return DEMO_LISTINGS;
  }
}

const DEMO_LISTINGS: ListingPublic[] = [
  {
    id: '0x1111111111111111111111111111111111111111111111111111111111111111',
    seller: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    askPrice: (800_000n * 10n ** 18n).toString(),
    requiredKarmaTier: 1,
    itemMeta: {
      title: '맥북 M1 Pro 14인치 (2021)',
      description: '상태 최상. 박스·충전기·보증서 있음. 강남/송파 직거래 선호.',
      category: 'electronics',
      images: [],
    },
    status: 'open',
    createdAt: Math.floor(Date.now() / 1000) - 3600,
  },
  {
    id: '0x2222222222222222222222222222222222222222222222222222222222222222',
    seller: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    askPrice: (150_000n * 10n ** 18n).toString(),
    requiredKarmaTier: 0,
    itemMeta: {
      title: '나이키 에어맥스 270 (270mm)',
      description: '3회 착용. 박스 없음. 어디서나 직거래 가능.',
      category: 'fashion',
      images: [],
    },
    status: 'open',
    createdAt: Math.floor(Date.now() / 1000) - 7200,
  },
  {
    id: '0x3333333333333333333333333333333333333333333333333333333333333333',
    seller: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    askPrice: (600_000n * 10n ** 18n).toString(),
    requiredKarmaTier: 2,
    itemMeta: {
      title: '다이슨 V15 무선청소기',
      description: '6개월 사용. AS 잔여기간 있음. Tier 2+ 만 오퍼 가능 (고가 매물).',
      category: 'other',
      images: [],
    },
    status: 'open',
    createdAt: Math.floor(Date.now() / 1000) - 1800,
  },
];

export default async function ListingsPage() {
  const listings = await fetchListings();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">매물 목록</h1>
          <p className="text-sm text-muted-foreground">{listings.length}개 매물</p>
        </div>
        <Button asChild size="sm">
          <Link href="/listings/new">+ 매물 등록</Link>
        </Button>
      </div>

      {listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <p className="text-4xl" aria-hidden="true">📦</p>
          <p className="text-muted-foreground">아직 등록된 매물이 없습니다.</p>
          <Button asChild>
            <Link href="/listings/new">첫 매물 등록하기</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}
