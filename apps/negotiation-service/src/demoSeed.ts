// Demo listings seeded on service boot so the matchmaker has something to
// evaluate intents against during the hackathon demo. These mirror
// apps/web/lib/demo-listings.ts. enc_* columns get placeholders — the seed
// listings are only exercised by the matchmaker (which reads title /
// category / description) and by the /listing GET (public-fields only).
// They are NOT intended to back real offer submissions.
import type { EncryptedBlob, ListingId, ListingMeta } from '@bargo/shared';
import type Database from 'better-sqlite3';
import type { FastifyBaseLogger } from 'fastify';
import { getListingById, insertListing } from './db/client.js';

interface DemoListing {
  id: ListingId;
  seller: `0x${string}`;
  requiredKarmaTier: 0 | 1 | 2 | 3;
  itemMeta: ListingMeta;
}

const DEMO_LISTINGS: DemoListing[] = [
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
  },
];

const PLACEHOLDER_BLOB: EncryptedBlob = {
  v: 1,
  ephPub: `0x${'00'.repeat(32)}`,
  nonce: `0x${'00'.repeat(24)}`,
  ct: `0x${'00'.repeat(16)}`,
};

export function seedDemoListings(db: Database.Database, log: FastifyBaseLogger): void {
  let inserted = 0;
  for (const demo of DEMO_LISTINGS) {
    if (getListingById(db, demo.id)) continue;
    insertListing(db, {
      id: demo.id,
      seller: demo.seller,
      requiredKarmaTier: demo.requiredKarmaTier,
      itemMetaJson: JSON.stringify(demo.itemMeta),
      encMinSell: PLACEHOLDER_BLOB,
      encSellerConditions: PLACEHOLDER_BLOB,
    });
    inserted++;
  }
  log.info({ inserted, total: DEMO_LISTINGS.length }, 'demo listings seeded');
}
