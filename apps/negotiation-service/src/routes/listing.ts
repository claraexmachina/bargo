// POST /listing
// Registers a new listing with plaintext reservation data (V2 — no encryption).
// GET /listings + GET /listing/:id return public fields only (plaintext reservation never exposed).
//
// listingId computation:
//   keccak256(abiEncodePacked(['address','uint256','uint256'], [seller, askPrice, nonce]))

import type { FastifyInstance } from 'fastify';
import { keccak256, encodePacked } from 'viem';
import { postListingRequestSchema } from '@haggle/shared';
import type { ListingMeta, KarmaTier } from '@haggle/shared';
import {
  insertListing,
  nextCounter,
  getListingById,
  listOpenListings,
  bufferToHex,
} from '../db/client.js';
import type Database from 'better-sqlite3';

export async function listingRoutes(
  app: FastifyInstance,
  opts: { db: Database.Database },
) {
  // GET /listings — public listing feed. Plaintext reservation columns never returned.
  app.get('/listings', async (request, reply) => {
    const q = request.query as { limit?: string; offset?: string };
    const limit = Math.min(Math.max(Number(q.limit ?? 50), 1), 100);
    const offset = Math.max(Number(q.offset ?? 0), 0);

    const rows = listOpenListings(opts.db, limit, offset);
    return reply.send({
      listings: rows.map((row) => ({
        id: bufferToHex(row.id),
        seller: row.seller,
        askPrice: row.ask_price,
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
      askPrice: row.ask_price,
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
        error: { code: 'bad-request', message: result.error.issues[0]?.message ?? 'Invalid request body' },
      });
    }

    const body = result.data;

    // Per-seller monotonic nonce to avoid ID collisions across restarts
    const nonce = nextCounter(opts.db, `listing:${body.seller}`);

    const listingId = keccak256(
      encodePacked(
        ['address', 'uint256', 'uint256'],
        [body.seller, BigInt(body.askPrice), BigInt(nonce)],
      ),
    );

    insertListing(opts.db, {
      id: listingId,
      seller: body.seller,
      askPrice: body.askPrice,
      requiredKarmaTier: body.requiredKarmaTier,
      itemMetaJson: JSON.stringify(body.itemMeta),
      plaintextMinSell: body.plaintextMinSell,
      plaintextSellerConditions: body.plaintextSellerConditions,
    });

    app.log.info({ listingId, seller: body.seller }, 'listing registered');

    return reply.code(201).send({
      listingId,
      onchainTxHash: null,
    });
  });
}
