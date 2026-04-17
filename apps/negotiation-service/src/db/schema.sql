-- Haggle Negotiation Service — SQLite schema (V2)
-- WAL mode enabled in client.ts at startup.
-- All IDs are stored as BLOB (bytes32 / UUID in binary).
-- Timestamps are unix seconds (INTEGER).
-- V2: plaintext columns replace enc_* blobs; auto-purge trigger on completion.

CREATE TABLE IF NOT EXISTS listings (
  id                          BLOB PRIMARY KEY,
  seller                      TEXT NOT NULL,
  ask_price                   TEXT NOT NULL,
  required_karma_tier         INTEGER NOT NULL,
  item_meta_json              TEXT NOT NULL,
  plaintext_min_sell          TEXT,   -- NULLed after deal completed (auto-purge)
  plaintext_seller_conditions TEXT,   -- NULLed after deal completed (auto-purge)
  status                      TEXT NOT NULL DEFAULT 'open',
  onchain_tx_hash             TEXT,
  created_at                  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);

CREATE TABLE IF NOT EXISTS offers (
  id                           BLOB PRIMARY KEY,
  listing_id                   BLOB NOT NULL,
  buyer                        TEXT NOT NULL,
  bid_price                    TEXT NOT NULL,
  plaintext_max_buy            TEXT,   -- NULLed after deal completed (auto-purge)
  plaintext_buyer_conditions   TEXT,   -- NULLed after deal completed (auto-purge)
  rln_nullifier                BLOB NOT NULL,
  rln_epoch                    INTEGER NOT NULL,
  status                       TEXT NOT NULL DEFAULT 'pending',
  created_at                   INTEGER NOT NULL,
  FOREIGN KEY (listing_id) REFERENCES listings(id)
);

CREATE INDEX IF NOT EXISTS idx_offers_listing_id ON offers(listing_id);

CREATE TABLE IF NOT EXISTS negotiations (
  id                        BLOB PRIMARY KEY,
  listing_id                BLOB NOT NULL,
  offer_id                  BLOB NOT NULL,
  state                     TEXT NOT NULL DEFAULT 'queued',
  attestation_json          TEXT,   -- NearAiAttestation (summary struct)
  near_ai_attestation_hash  TEXT,   -- keccak256(canonical(bundle))
  agreed_conditions_hash    TEXT,   -- keccak256(agreed conditions)
  agreed_conditions_json    TEXT,   -- AgreedConditions JSON
  model_id                  TEXT,
  completion_id             TEXT,
  attestation_bundle_path   TEXT,   -- path on disk: ./data/attestations/<dealId>.json
  onchain_tx_hash           TEXT,
  failure_reason            TEXT,
  created_at                INTEGER NOT NULL,
  updated_at                INTEGER NOT NULL,
  FOREIGN KEY (listing_id) REFERENCES listings(id),
  FOREIGN KEY (offer_id) REFERENCES offers(id)
);

CREATE INDEX IF NOT EXISTS idx_negotiations_state ON negotiations(state);

-- RLN nullifier deduplication and rate-limiting per epoch.
CREATE TABLE IF NOT EXISTS rln_nullifiers (
  nullifier  BLOB    NOT NULL,
  epoch      INTEGER NOT NULL,
  count      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (nullifier, epoch)
);

-- Monotonic nonce counter for off-chain ID generation.
CREATE TABLE IF NOT EXISTS id_counters (
  key    TEXT PRIMARY KEY,
  value  INTEGER NOT NULL DEFAULT 0
);

-- Auto-purge plaintext reservation data when a negotiation reaches 'completed'.
-- Safety net on top of the application-level purge in chain/watcher.ts.
CREATE TRIGGER IF NOT EXISTS purge_plaintext_on_complete
AFTER UPDATE ON negotiations
WHEN NEW.state = 'completed' AND OLD.state != 'completed'
BEGIN
  UPDATE listings
    SET plaintext_min_sell = NULL,
        plaintext_seller_conditions = NULL
    WHERE id = NEW.listing_id;
  UPDATE offers
    SET plaintext_max_buy = NULL,
        plaintext_buyer_conditions = NULL
    WHERE id = NEW.offer_id;
END;
