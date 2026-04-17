import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { EncryptedBlob, ListingId, OfferId, DealId, TeeAttestation, KarmaTier } from '@haggle/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- DB row types ---

export interface ListingRow {
  id: Buffer;
  seller: string;
  ask_price: string;
  required_karma_tier: number;
  item_meta_json: string;
  enc_min_sell_json: string;
  enc_seller_conditions_json: string;
  status: string;
  onchain_tx_hash: string | null;
  created_at: number;
}

export interface OfferRow {
  id: Buffer;
  listing_id: Buffer;
  buyer: string;
  bid_price: string;
  enc_max_buy_json: string;
  enc_buyer_conditions_json: string;
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
  onchain_tx_hash: string | null;
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

function hexToBuffer(hex: `0x${string}`): Buffer {
  return Buffer.from(hex.slice(2), 'hex');
}

function bufferToHex(buf: Buffer): `0x${string}` {
  return `0x${buf.toString('hex')}`;
}

// --- Listing operations ---

export interface InsertListingParams {
  id: ListingId;
  seller: string;
  askPrice: string;
  requiredKarmaTier: KarmaTier;
  itemMetaJson: string;
  encMinSellJson: string;
  encSellerConditionsJson: string;
}

export function insertListing(db: Database.Database, params: InsertListingParams): void {
  const stmt = db.prepare<[Buffer, string, string, number, string, string, string, number]>(`
    INSERT INTO listings
      (id, seller, ask_price, required_karma_tier, item_meta_json, enc_min_sell_json, enc_seller_conditions_json, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
  `);
  stmt.run(
    hexToBuffer(params.id),
    params.seller,
    params.askPrice,
    params.requiredKarmaTier,
    params.itemMetaJson,
    params.encMinSellJson,
    params.encSellerConditionsJson,
    Math.floor(Date.now() / 1000),
  );
}

export function getListingById(db: Database.Database, id: ListingId): ListingRow | null {
  const stmt = db.prepare<[Buffer], ListingRow>('SELECT * FROM listings WHERE id = ?');
  return stmt.get(hexToBuffer(id)) ?? null;
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
  encMaxBuyJson: string;
  encBuyerConditionsJson: string;
  rlnNullifier: `0x${string}`;
  rlnEpoch: number;
}

export function insertOffer(db: Database.Database, params: InsertOfferParams): void {
  const stmt = db.prepare<[Buffer, Buffer, string, string, string, string, Buffer, number, number]>(`
    INSERT INTO offers
      (id, listing_id, buyer, bid_price, enc_max_buy_json, enc_buyer_conditions_json, rln_nullifier, rln_epoch, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `);
  stmt.run(
    hexToBuffer(params.id),
    hexToBuffer(params.listingId),
    params.buyer,
    params.bidPrice,
    params.encMaxBuyJson,
    params.encBuyerConditionsJson,
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

/**
 * Records a nullifier use for the given epoch. Returns the new count.
 * Uses INSERT OR IGNORE + UPDATE to atomically increment.
 */
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
  attestation?: TeeAttestation,
  onchainTxHash?: string,
): void {
  const stmt = db.prepare<[string, string | null, string | null, number, Buffer]>(`
    UPDATE negotiations
    SET state = ?, attestation_json = ?, onchain_tx_hash = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(
    state,
    attestation ? JSON.stringify(attestation) : null,
    onchainTxHash ?? null,
    Math.floor(Date.now() / 1000),
    hexToBuffer(id),
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

// --- Re-export buffer helpers for use in routes ---
export { hexToBuffer, bufferToHex };
