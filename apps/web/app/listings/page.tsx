import { ListingCard } from '@/components/ListingCard';
import { Button } from '@/components/ui/button';
import type { ListingPublic } from '@bargo/shared';
// Listings page — RSC. Fetches open listings from the negotiation service.
// Falls back to a local demo fixture if the service is unreachable (dev without backend).
import Link from 'next/link';

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
      description:
        'Excellent condition. Box, charger, and warranty included. Prefer in-person meetup Gangnam/Songpa.',
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
      title: 'Nike Air Max 270 (270mm)',
      description: 'Worn 3 times. No box. In-person meetup anywhere.',
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
      title: 'Dyson V15 Cordless Vacuum',
      description: 'Used 6 months. Warranty remaining. Tier 2+ only (high-value item).',
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
          <h1 className="text-2xl font-bold">Listings</h1>
          <p className="text-sm text-muted-foreground">{listings.length} listings</p>
        </div>
        <Button asChild size="sm">
          <Link href="/listings/new">+ Create listing</Link>
        </Button>
      </div>

      {listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <p className="text-4xl" aria-hidden="true">
            📦
          </p>
          <p className="text-muted-foreground">No listings yet.</p>
          <Button asChild>
            <Link href="/listings/new">Create your first listing</Link>
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
