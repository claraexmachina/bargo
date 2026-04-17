import { ListingCard } from '@/components/ListingCard';
import { Button } from '@/components/ui/button';
import { DEMO_LISTINGS } from '@/lib/demo-listings';
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
