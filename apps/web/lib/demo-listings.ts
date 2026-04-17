import type { ListingPublic } from '@bargo/shared';

/**
 * Local fixture used when the negotiation service isn't running.
 * Shared between the listings grid (RSC) and the detail page (client)
 * so clicking a card always resolves to a viewable page in demo mode.
 */
export const DEMO_LISTINGS: ListingPublic[] = [
  {
    id: '0x1111111111111111111111111111111111111111111111111111111111111111',
    seller: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    requiredKarmaTier: 1,
    itemMeta: {
      title: 'MacBook M1 Pro 14" (2021)',
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

export function findDemoListing(id: string): ListingPublic | undefined {
  return DEMO_LISTINGS.find((l) => l.id.toLowerCase() === id.toLowerCase());
}
