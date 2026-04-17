// RLN nullifier deduplication and epoch rate-limit tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { verifyRlnProof } from '../src/rln/verify.js';
import type { RLNProof } from '@bargo/shared';
import { RLN_MAX_PER_EPOCH } from '@bargo/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

function buildDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = readFileSync(join(__dirname, '../src/db/schema.sql'), 'utf-8');
  db.exec(schema);
  return db;
}

function makeProof(overrides?: Partial<RLNProof>): RLNProof {
  return {
    epoch: 100,
    proof: '0x' + 'aa'.repeat(32),
    nullifier: '0x' + '11'.repeat(32),
    signalHash: '0x' + '22'.repeat(32),
    rlnIdentityCommitment: '0x' + '33'.repeat(32),
    ...overrides,
  };
}

describe('verifyRlnProof', () => {
  let db: Database.Database;

  beforeEach(() => { db = buildDb(); });
  afterEach(() => { db.close(); });

  it('first use → ok', () => {
    const result = verifyRlnProof(db, makeProof());
    expect(result.ok).toBe(true);
  });

  it('same nullifier, same epoch, up to MAX_PER_EPOCH → ok', () => {
    for (let i = 0; i < RLN_MAX_PER_EPOCH; i++) {
      const result = verifyRlnProof(db, makeProof());
      expect(result.ok).toBe(true);
    }
  });

  it(`exceeding MAX_PER_EPOCH (${RLN_MAX_PER_EPOCH}) → epoch-limit-exceeded`, () => {
    for (let i = 0; i < RLN_MAX_PER_EPOCH; i++) {
      verifyRlnProof(db, makeProof());
    }
    const result = verifyRlnProof(db, makeProof());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('epoch-limit-exceeded');
    }
  });

  it('same nullifier, different epoch → each epoch has its own limit', () => {
    // Max out epoch 100
    for (let i = 0; i < RLN_MAX_PER_EPOCH; i++) {
      verifyRlnProof(db, makeProof({ epoch: 100 }));
    }
    // Epoch 101 should still be ok
    const result = verifyRlnProof(db, makeProof({ epoch: 101 }));
    expect(result.ok).toBe(true);
  });

  it('different nullifier, same epoch → independent limit', () => {
    const nullifier1 = '0x' + '11'.repeat(32);
    const nullifier2 = '0x' + '22'.repeat(32);

    // Max out nullifier1
    for (let i = 0; i < RLN_MAX_PER_EPOCH; i++) {
      verifyRlnProof(db, makeProof({ nullifier: nullifier1 }));
    }

    // nullifier2 should still work
    const result = verifyRlnProof(db, makeProof({ nullifier: nullifier2 }));
    expect(result.ok).toBe(true);
  });

  it('zero nullifier → invalid-proof', () => {
    const result = verifyRlnProof(db, makeProof({
      nullifier: '0x0000000000000000000000000000000000000000000000000000000000000000',
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid-proof');
    }
  });

  it('empty proof bytes → invalid-proof', () => {
    const result = verifyRlnProof(db, makeProof({ proof: '0x' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid-proof');
    }
  });

  it('invalid epoch (0) → invalid-proof', () => {
    const result = verifyRlnProof(db, makeProof({ epoch: 0 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid-proof');
    }
  });
});
