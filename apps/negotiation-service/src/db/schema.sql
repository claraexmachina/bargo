-- Haggle Negotiation Service — SQLite schema
-- WAL mode enabled in client.ts at startup.
-- All IDs are stored as BLOB (bytes32 / UUID in binary).
-- Timestamps are unix seconds (INTEGER).

CREATE TABLE IF NOT EXISTS listings (
  id                        BLOB PRIMARY KEY,
  seller                    TEXT NOT NULL,
  ask_price                 TEXT NOT NULL,
  required_karma_tier       INTEGER NOT NULL,
  item_meta_json            TEXT NOT NULL,
  enc_min_sell_json         TEXT NOT NULL,
  enc_seller_conditions_json TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'open',
  onchain_tx_hash           TEXT,
  created_at                INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);

CREATE TABLE IF NOT EXISTS offers (
  id                         BLOB PRIMARY KEY,
  listing_id                 BLOB NOT NULL,
  buyer                      TEXT NOT NULL,
  bid_price                  TEXT NOT NULL,
  enc_max_buy_json           TEXT NOT NULL,
  enc_buyer_conditions_json  TEXT NOT NULL,
  rln_nullifier              BLOB NOT NULL,
  rln_epoch                  INTEGER NOT NULL,
  status                     TEXT NOT NULL DEFAULT 'pending',
  created_at                 INTEGER NOT NULL,
  FOREIGN KEY (listing_id) REFERENCES listings(id)
);

CREATE INDEX IF NOT EXISTS idx_offers_listing_id ON offers(listing_id);

CREATE TABLE IF NOT EXISTS negotiations (
  id                BLOB PRIMARY KEY,
  listing_id        BLOB NOT NULL,
  offer_id          BLOB NOT NULL,
  state             TEXT NOT NULL DEFAULT 'queued',
  attestation_json  TEXT,
  onchain_tx_hash   TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  FOREIGN KEY (listing_id) REFERENCES listings(id),
  FOREIGN KEY (offer_id) REFERENCES offers(id)
);

CREATE INDEX IF NOT EXISTS idx_negotiations_state ON negotiations(state);

-- RLN nullifier deduplication and rate-limiting per epoch.
-- count tracks how many times this nullifier was seen in this epoch.
-- PRIMARY KEY(nullifier, epoch) enforces uniqueness.
CREATE TABLE IF NOT EXISTS rln_nullifiers (
  nullifier  BLOB    NOT NULL,
  epoch      INTEGER NOT NULL,
  count      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (nullifier, epoch)
);

-- Monotonic nonce counter for off-chain ID generation (used in keccak hash inputs).
CREATE TABLE IF NOT EXISTS id_counters (
  key    TEXT PRIMARY KEY,
  value  INTEGER NOT NULL DEFAULT 0
);
