import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DealId, KarmaTier, ListingId, NearAiAttestation, OfferId } from '@bargo/shared';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- DB row types ---

export interface ListingRow {
  id: Buffer;
  seller: string;
  ask_price: string;
  required_karma_tier: number;
  item_meta_json: string;
  plaintext_min_sell: string | null;
  plaintext_seller_conditions: string | null;
  status: string;
  onchain_tx_hash: string | null;
  created_at: number;
}

export interface OfferRow {
  id: Buffer;
  listing_id: Buffer;
  buyer: string;
  bid_price: string;
  plaintext_max_buy: string | null;
  plaintext_buyer_conditions: string | null;
  rln_nullifier: Buffer;
  rln_epoch: number;
  status: string;
  created_at: number;
}

export interface NegotiationRow {
  id: Buffer;
  listing_id: Buffer;
  offer_id: Buffer;
  state: string;
  attestation_json: string | null;
  near_ai_attestation_hash: string | null;
  agreed_conditions_hash: string | null;
  agreed_conditions_json: string | null;
  model_id: string | null;
  completion_id: string | null;
  attestation_bundle_path: string | null;
  onchain_tx_hash: string | null;
  failure_reason: string | null;
  created_at: number;
  updated_at: number;
}

// --- Singleton ---

let _db: Database.Database | null = null;

export function getDb(dbPath: string): Database.Database {
  if (_db) return _db;

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.pragma('busy_timeout = 5000');

  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  _db.exec(schema);

  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// --- Helper: hex string ↔ Buffer (for BLOB storage) ---

export function hexToBuffer(hex: `0x${string}`): Buffer {
  return Buffer.from(hex.slice(2), 'hex');
}

export function bufferToHex(buf: Buffer): `0x${string}` {
  return `0x${buf.toString('hex')}`;
}

// --- Listing operations ---

export interface InsertListingParams {
  id: ListingId;
  seller: string;
  askPrice: string;
  requiredKarmaTier: KarmaTier;
  itemMetaJson: string;
  plaintextMinSell: string;
  plaintextSellerConditions: string;
}

export function insertListing(db: Database.Database, params: InsertListingParams): void {
  const stmt = db.prepare<[Buffer, string, string, number, string, string, string, number]>(`
    INSERT INTO listings
      (id, seller, ask_price, required_karma_tier, item_meta_json,
       plaintext_min_sell, plaintext_seller_conditions, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
  `);
  stmt.run(
    hexToBuffer(params.id),
    params.seller,
    params.askPrice,
    params.requiredKarmaTier,
    params.itemMetaJson,
    params.plaintextMinSell,
    params.plaintextSellerConditions,
    Math.floor(Date.now() / 1000),
  );
}

export function getListingById(db: Database.Database, id: ListingId): ListingRow | null {
  const stmt = db.prepare<[Buffer], ListingRow>('SELECT * FROM listings WHERE id = ?');
  return stmt.get(hexToBuffer(id)) ?? null;
}

export function listOpenListings(
  db: Database.Database,
  limit: number,
  offset: number,
): ListingRow[] {
  const stmt = db.prepare<[number, number], ListingRow>(
    `SELECT * FROM listings WHERE status = 'open' ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  );
  return stmt.all(limit, offset);
}

export function updateListingStatus(
  db: Database.Database,
  id: ListingId,
  status: string,
  onchainTxHash?: string,
): void {
  const stmt = db.prepare<[string, string | null, Buffer]>(
    'UPDATE listings SET status = ?, onchain_tx_hash = ? WHERE id = ?',
  );
  stmt.run(status, onchainTxHash ?? null, hexToBuffer(id));
}

export function getListingIdBuffer(row: ListingRow): ListingId {
  return bufferToHex(row.id);
}

// --- Offer operations ---

export interface InsertOfferParams {
  id: OfferId;
  listingId: ListingId;
  buyer: string;
  bidPrice: string;
  plaintextMaxBuy: string;
  plaintextBuyerConditions: string;
  rlnNullifier: `0x${string}`;
  rlnEpoch: number;
}

export function insertOffer(db: Database.Database, params: InsertOfferParams): void {
  const stmt = db.prepare<
    [Buffer, Buffer, string, string, string, string, Buffer, number, number]
  >(`
    INSERT INTO offers
      (id, listing_id, buyer, bid_price, plaintext_max_buy, plaintext_buyer_conditions,
       rln_nullifier, rln_epoch, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `);
  stmt.run(
    hexToBuffer(params.id),
    hexToBuffer(params.listingId),
    params.buyer,
    params.bidPrice,
    params.plaintextMaxBuy,
    params.plaintextBuyerConditions,
    hexToBuffer(params.rlnNullifier),
    params.rlnEpoch,
    Math.floor(Date.now() / 1000),
  );
}

export function getOfferById(db: Database.Database, id: OfferId): OfferRow | null {
  const stmt = db.prepare<[Buffer], OfferRow>('SELECT * FROM offers WHERE id = ?');
  return stmt.get(hexToBuffer(id)) ?? null;
}

export function updateOfferStatus(db: Database.Database, id: OfferId, status: string): void {
  const stmt = db.prepare<[string, Buffer]>('UPDATE offers SET status = ? WHERE id = ?');
  stmt.run(status, hexToBuffer(id));
}

// --- RLN nullifier operations ---

export function recordRlnNullifier(
  db: Database.Database,
  nullifier: `0x${string}`,
  epoch: number,
): number {
  const buf = hexToBuffer(nullifier);
  const insert = db.prepare<[Buffer, number]>(`
    INSERT OR IGNORE INTO rln_nullifiers (nullifier, epoch, count) VALUES (?, ?, 0)
  `);
  const update = db.prepare<[Buffer, number], { count: number }>(`
    UPDATE rln_nullifiers SET count = count + 1 WHERE nullifier = ? AND epoch = ?
    RETURNING count
  `);

  const tx = db.transaction(() => {
    insert.run(buf, epoch);
    const row = update.get(buf, epoch);
    if (!row) throw new Error('rln_nullifiers update failed unexpectedly');
    return row.count;
  });

  return tx();
}

export function getRlnNullifierCount(
  db: Database.Database,
  nullifier: `0x${string}`,
  epoch: number,
): number {
  const stmt = db.prepare<[Buffer, number], { count: number }>(
    'SELECT count FROM rln_nullifiers WHERE nullifier = ? AND epoch = ?',
  );
  const row = stmt.get(hexToBuffer(nullifier), epoch);
  return row?.count ?? 0;
}

// --- Negotiation operations ---

export interface CreateNegotiationParams {
  id: DealId;
  listingId: ListingId;
  offerId: OfferId;
}

export function createNegotiation(db: Database.Database, params: CreateNegotiationParams): void {
  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare<[Buffer, Buffer, Buffer, number, number]>(`
    INSERT INTO negotiations (id, listing_id, offer_id, state, created_at, updated_at)
    VALUES (?, ?, ?, 'queued', ?, ?)
  `);
  stmt.run(
    hexToBuffer(params.id),
    hexToBuffer(params.listingId),
    hexToBuffer(params.offerId),
    now,
    now,
  );
}

export function getNegotiationById(db: Database.Database, id: DealId): NegotiationRow | null {
  const stmt = db.prepare<[Buffer], NegotiationRow>('SELECT * FROM negotiations WHERE id = ?');
  return stmt.get(hexToBuffer(id)) ?? null;
}

export function updateNegotiationState(
  db: Database.Database,
  id: DealId,
  state: string,
  options?: {
    attestation?: NearAiAttestation;
    onchainTxHash?: string;
    failureReason?: string;
  },
): void {
  const stmt = db.prepare<[string, string | null, string | null, string | null, number, Buffer]>(`
    UPDATE negotiations
    SET state = ?, attestation_json = ?, onchain_tx_hash = ?, failure_reason = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(
    state,
    options?.attestation ? JSON.stringify(options.attestation) : null,
    options?.onchainTxHash ?? null,
    options?.failureReason ?? null,
    Math.floor(Date.now() / 1000),
    hexToBuffer(id),
  );
}

export interface UpdateNegotiationAttestationParams {
  agreedConditionsHash: string;
  nearAiAttestationHash: string;
  agreedConditionsJson: string;
  modelId: string;
  completionId: string;
  attestationBundlePath: string;
}

export function updateNegotiationAttestation(
  db: Database.Database,
  negotiationId: DealId,
  params: UpdateNegotiationAttestationParams,
): void {
  const stmt = db.prepare<[string, string, string, string, string, string, number, Buffer]>(`
    UPDATE negotiations
    SET near_ai_attestation_hash = ?,
        agreed_conditions_hash = ?,
        agreed_conditions_json = ?,
        model_id = ?,
        completion_id = ?,
        attestation_bundle_path = ?,
        updated_at = ?
    WHERE id = ?
  `);
  stmt.run(
    params.nearAiAttestationHash,
    params.agreedConditionsHash,
    params.agreedConditionsJson,
    params.modelId,
    params.completionId,
    params.attestationBundlePath,
    Math.floor(Date.now() / 1000),
    hexToBuffer(negotiationId),
  );
}

// --- Counter for monotonic ID nonce generation ---

export function nextCounter(db: Database.Database, key: string): number {
  const upsert = db.prepare<[string]>(`
    INSERT INTO id_counters (key, value) VALUES (?, 1)
    ON CONFLICT(key) DO UPDATE SET value = value + 1
    RETURNING value
  `);
  const row = upsert.get(key) as { value: number } | undefined;
  if (!row) throw new Error(`counter upsert failed for key: ${key}`);
  return row.value;
}
