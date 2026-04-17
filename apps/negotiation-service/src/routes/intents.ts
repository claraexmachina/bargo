// Routes: Standing Intents
// POST /intents         — register a sealed intent
// GET  /intents         — list active intents by buyer (public fields only, no enc blobs)
// DELETE /intents/:id   — deactivate an intent (buyer ownership check)
// GET  /intent-matches  — fetch match notifications for a buyer
// POST /intent-matches/ack — acknowledge a match

import { postIntentRequestSchema } from '@bargo/shared';
import type { IntentFilters, IntentId, KarmaTier, ListingId, ListingMeta } from '@bargo/shared';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { keccak256, toBytes } from 'viem';
import {
  acknowledgeIntentMatch,
  bufferToHex,
  deactivateIntent,
  getIntentMatchesByBuyer,
  insertIntent,
  listActiveIntentsByBuyer,
} from '../db/client.js';

export async function intentRoutes(app: FastifyInstance, opts: { db: Database.Database }) {
  // POST /intents — sealed intent registration
  app.post('/intents', async (request, reply) => {
    const result = postIntentRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        error: {
          code: 'bad-request',
          message: result.error.issues[0]?.message ?? 'Invalid request body',
        },
      });
    }

    const body = result.data;

    // intentId = keccak256(buyer_bytes || encMaxBuy.ct_bytes || now_bytes)
    const buyerBytes = new TextEncoder().encode(body.buyer);
    const ctBytes = toBytes(body.encMaxBuy.ct);
    const nowBytes = toBytes(BigInt(Math.floor(Date.now() / 1000)));
    const combined = new Uint8Array(buyerBytes.length + ctBytes.length + nowBytes.length);
    combined.set(buyerBytes, 0);
    combined.set(ctBytes, buyerBytes.length);
    combined.set(nowBytes, buyerBytes.length + ctBytes.length);
    const intentId = keccak256(combined) as IntentId;

    // Construct filters without undefined values (exactOptionalPropertyTypes)
    const filters: IntentFilters = {};
    if (body.filters.category !== undefined) filters.category = body.filters.category;
    if (body.filters.requiredKarmaTierCeiling !== undefined) {
      filters.requiredKarmaTierCeiling = body.filters.requiredKarmaTierCeiling;
    }

    insertIntent(opts.db, {
      id: intentId,
      buyer: body.buyer,
      encMaxBuy: body.encMaxBuy,
      encBuyerConditions: body.encBuyerConditions,
      filters,
      expiresAt: body.expiresAt,
    });

    app.log.info({ intentId, buyer: body.buyer }, 'intent registered');

    return reply.code(201).send({ intentId });
  });

  // GET /intents?buyer=0x... — public fields only, never enc blobs
  app.get('/intents', async (request, reply) => {
    const q = request.query as { buyer?: string };
    if (!q.buyer || !/^0x[0-9a-fA-F]{40}$/i.test(q.buyer)) {
      return reply.code(400).send({
        error: { code: 'bad-request', message: 'buyer query param must be a valid address' },
      });
    }

    const rows = listActiveIntentsByBuyer(opts.db, q.buyer);
    return reply.send({
      intents: rows.map((row) => ({
        id: bufferToHex(row.id),
        buyer: row.buyer,
        filters: JSON.parse(row.filters_json) as IntentFilters,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        active: row.active === 1,
      })),
    });
  });

  // DELETE /intents/:id?buyer=0x... — deactivate (ownership check)
  app.delete<{ Params: { id: string } }>('/intents/:id', async (request, reply) => {
    const { id } = request.params;
    const q = request.query as { buyer?: string };

    if (!id || !/^0x[0-9a-fA-F]{64}$/.test(id)) {
      return reply.code(400).send({
        error: { code: 'bad-request', message: 'id must be a valid bytes32 hex' },
      });
    }
    if (!q.buyer || !/^0x[0-9a-fA-F]{40}$/i.test(q.buyer)) {
      return reply.code(400).send({
        error: { code: 'bad-request', message: 'buyer query param must be a valid address' },
      });
    }

    // ownership check: verify buyer matches
    const rows = listActiveIntentsByBuyer(opts.db, q.buyer);
    const match = rows.find((r) => bufferToHex(r.id) === id);
    if (!match) {
      return reply.code(404).send({
        error: { code: 'not-found', message: 'intent not found or not owned by buyer' },
      });
    }

    deactivateIntent(opts.db, id as IntentId);
    app.log.info({ intentId: id, buyer: q.buyer }, 'intent deactivated');

    return reply.code(200).send({ ok: true });
  });

  // GET /intent-matches?buyer=0x...&since=<unix_sec>
  app.get('/intent-matches', async (request, reply) => {
    const q = request.query as { buyer?: string; since?: string };
    if (!q.buyer || !/^0x[0-9a-fA-F]{40}$/i.test(q.buyer)) {
      return reply.code(400).send({
        error: { code: 'bad-request', message: 'buyer query param must be a valid address' },
      });
    }

    const since = q.since ? Number(q.since) : undefined;
    const rows = getIntentMatchesByBuyer(opts.db, q.buyer, since);

    return reply.send({
      matches: rows.map((row) => ({
        intentId: bufferToHex(row.intent_id),
        listingId: bufferToHex(row.listing_id) as ListingId,
        seller: row.seller,
        itemMeta: JSON.parse(row.item_meta_json) as ListingMeta,
        requiredKarmaTier: row.required_karma_tier as KarmaTier,
        score: row.score as 'match' | 'likely' | 'uncertain',
        matchReason: row.match_reason,
        matchedAt: row.matched_at,
        acknowledged: row.acknowledged === 1,
      })),
    });
  });

  // POST /intent-matches/ack
  app.post('/intent-matches/ack', async (request, reply) => {
    const body = request.body as { intentId?: string; listingId?: string };

    if (!body.intentId || !/^0x[0-9a-fA-F]{64}$/.test(body.intentId)) {
      return reply.code(400).send({
        error: { code: 'bad-request', message: 'intentId must be a valid bytes32 hex' },
      });
    }
    if (!body.listingId || !/^0x[0-9a-fA-F]{64}$/.test(body.listingId)) {
      return reply.code(400).send({
        error: { code: 'bad-request', message: 'listingId must be a valid bytes32 hex' },
      });
    }

    acknowledgeIntentMatch(opts.db, body.intentId as IntentId, body.listingId as ListingId);
    return reply.code(200).send({ ok: true });
  });
}
