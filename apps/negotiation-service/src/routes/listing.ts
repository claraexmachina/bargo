// POST /listing
// Registers a new listing with encrypted reservation blobs (V3 — sealed-bid).
// GET /listings + GET /listing/:id return public fields only — no prices, no enc blobs.
//
// listingId: provided by caller (on-chain id from seller's registerListing tx).

import { postListingRequestSchema } from '@bargo/shared';
import type { KarmaTier, ListingId, ListingMeta } from '@bargo/shared';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { bufferToHex, getListingById, insertListing, listOpenListings } from '../db/client.js';

export async function listingRoutes(app: FastifyInstance, opts: { db: Database.Database }) {
  // GET /listings — public listing feed. Enc blobs never returned.
  app.get('/listings', async (request, reply) => {
    const q = request.query as { limit?: string; offset?: string };
    const limit = Math.min(Math.max(Number(q.limit ?? 50), 1), 100);
    const offset = Math.max(Number(q.offset ?? 0), 0);

    const rows = listOpenListings(opts.db, limit, offset);
    return reply.send({
      listings: rows.map((row) => ({
        id: bufferToHex(row.id),
        seller: row.seller,
        requiredKarmaTier: row.required_karma_tier as KarmaTier,
        itemMeta: JSON.parse(row.item_meta_json) as ListingMeta,
        status: row.status,
        createdAt: row.created_at,
      })),
    });
  });

  // GET /listing/:id — single listing detail (public fields only)
  app.get<{ Params: { id: `0x${string}` } }>('/listing/:id', async (request, reply) => {
    const row = getListingById(opts.db, request.params.id);
    if (!row) {
      return reply.code(404).send({ error: { code: 'not-found', message: 'listing not found' } });
    }
    return reply.send({
      id: bufferToHex(row.id),
      seller: row.seller,
      requiredKarmaTier: row.required_karma_tier as KarmaTier,
      itemMeta: JSON.parse(row.item_meta_json) as ListingMeta,
      status: row.status,
      createdAt: row.created_at,
    });
  });

  app.post('/listing', async (request, reply) => {
    const result = postListingRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        error: {
          code: 'bad-request',
          message: result.error.issues[0]?.message ?? 'Invalid request body',
        },
      });
    }

    const body = result.data;

    // listingId is the on-chain id produced by the seller's registerListing tx.
    const listingId = body.listingId as ListingId;

    // Store enc blobs as-is — never decrypt in this route.
    insertListing(opts.db, {
      id: listingId,
      seller: body.seller,
      requiredKarmaTier: body.requiredKarmaTier,
      itemMetaJson: JSON.stringify(body.itemMeta),
      encMinSell: body.encMinSell,
      encSellerConditions: body.encSellerConditions,
    });

    app.log.info({ listingId, seller: body.seller }, 'listing registered');

    return reply.code(201).send({
      listingId,
      onchainTxHash: body.onchainTxHash,
    });
  });
}
