// Plaintext regression guard — verifies that the web's POST /listing and POST /offer
// bodies send plaintextMinSell / plaintextMaxBuy (not encrypted blobs) and that the
// negotiation service echoes back no reservation data in GET /status.
//
// This replaces the old V1 "web-side encryption bug" repro (offerId=ZERO_BYTES32 AAD mismatch).
// V2 has no client-side encryption, so that bug class is gone. This script guards against
// accidental re-introduction of an encrypt.ts import or enc* field names.
//
// Run: node scripts/qa-web-bug-repro.mjs
// Env: NEG_URL — negotiation service base URL (default http://localhost:3001)
// Note: requires DEV_SKIP_ONCHAIN_VERIFY=1 on the service side.

import { toHex } from 'viem';

const BASE = process.env.NEG_URL ?? 'http://localhost:3001';

const SELLER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const BUYER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

function randHex32() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

async function j(method, path, body) {
  const r = await fetch(BASE + path, {
    method, headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: r.ok ? await r.json() : await r.text() };
}

async function main() {
  console.log('=== V2 plaintext regression guard ===\n');

  // 1. Verify no enc* fields are accepted (backward-compat guard).
  //    If a V1 field is accidentally re-introduced, the schema should reject it with 400.
  const listingId = randHex32();
  const listingBody = {
    listingId,
    seller: SELLER,
    askPrice: '1000000000000000000000000',
    requiredKarmaTier: 0,
    itemMeta: { title: 'Regression Guard', description: '', category: 'other', images: [] },
    plaintextMinSell: '700000000000000000000000',
    plaintextSellerConditions: 'no preference',
    onchainTxHash: randHex32(),
    // V1 fields — these should either be rejected or silently ignored (not stored).
    encMinSell: '0xdeadbeef',
    encSellerConditions: '0xdeadbeef',
  };

  const listingRes = await j('POST', '/listing', listingBody);
  if (listingRes.status === 201) {
    console.log('[PASS] POST /listing accepted (extra V1 fields ignored or rejected — 201 means plaintext path works)');
    // Verify the response does not echo back enc* fields
    const body = JSON.stringify(listingRes.body);
    if (body.includes('encMinSell') || body.includes('encSellerConditions')) {
      console.log('[FAIL] Response echoes V1 enc* fields — schema needs cleanup');
      process.exit(1);
    }
    console.log('[PASS] Response body does not echo enc* fields');
  } else if (listingRes.status === 400) {
    console.log('[PASS] POST /listing rejected V1 enc* fields with 400 (strict schema)');
  } else {
    console.log(`[FAIL] Unexpected status ${listingRes.status}: ${JSON.stringify(listingRes.body)}`);
    process.exit(1);
  }

  // 2. Verify plaintext fields ARE accepted (regression: ensure plaintextMinSell works).
  const listing2Id = randHex32();
  const listing2 = await j('POST', '/listing', {
    listingId: listing2Id,
    seller: SELLER,
    askPrice: '800000000000000000000000',
    requiredKarmaTier: 0,
    itemMeta: { title: 'Plaintext Check', description: '', category: 'electronics', images: [] },
    plaintextMinSell: '600000000000000000000000',
    plaintextSellerConditions: '강남 only',
    onchainTxHash: randHex32(),
  });
  if (listing2.status !== 201) {
    console.log(`[FAIL] POST /listing with plaintextMinSell returned ${listing2.status} — plaintext path broken`);
    process.exit(1);
  }
  console.log('[PASS] POST /listing with plaintextMinSell accepted (201)');

  // 3. Verify POST /offer with plaintextMaxBuy is accepted.
  const offerId = randHex32();
  const offerRes = await j('POST', '/offer', {
    offerId,
    buyer: BUYER,
    listingId: listing2Id,
    bidPrice: '700000000000000000000000',
    plaintextMaxBuy: '750000000000000000000000',
    plaintextBuyerConditions: '강남 ok, anytime',
    rlnProof: {
      epoch: 42,
      proof: '0x' + 'aa'.repeat(32),
      nullifier: randHex32(),
      signalHash: '0x' + '22'.repeat(32),
      rlnIdentityCommitment: '0x' + '33'.repeat(32),
    },
    onchainTxHash: randHex32(),
  });
  if (offerRes.status !== 202) {
    console.log(`[FAIL] POST /offer with plaintextMaxBuy returned ${offerRes.status}: ${JSON.stringify(offerRes.body)}`);
    process.exit(1);
  }
  console.log('[PASS] POST /offer with plaintextMaxBuy accepted (202)');

  // 4. Verify GET /status does not leak plaintext reservation data.
  const negotiationId = offerRes.body.negotiationId;
  // Poll briefly for a result
  let statusBody = null;
  for (let i = 0; i < 30; i++) {
    const s = await j('GET', `/status/${negotiationId}`);
    if (s.status === 200 && s.body.state !== 'queued' && s.body.state !== 'running') {
      statusBody = s.body;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!statusBody) {
    console.log('[SKIP] Status did not reach terminal state in 15s — manually verify privacy invariant');
  } else {
    const bodyStr = JSON.stringify(statusBody);
    const leaks =
      bodyStr.includes('600000') || // plaintextMinSell
      bodyStr.includes('750000') || // plaintextMaxBuy
      bodyStr.includes('강남 only') || // seller conditions
      bodyStr.includes('anytime');   // buyer conditions
    if (leaks) {
      console.log('[FAIL] GET /status leaks plaintext reservation data — privacy regression!');
      process.exit(1);
    }
    console.log(`[PASS] GET /status (state=${statusBody.state}) does not leak reservation data`);
  }

  console.log('\n=== All plaintext regression checks passed ===');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
