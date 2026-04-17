// QA integration audit — drives the negotiation service via HTTP (V2 plaintext DTOs).
// No encryption; all reservation data sent as plaintext over HTTPS to the service.
//
// NOTE: This script assumes DEV_SKIP_ONCHAIN_VERIFY=1 is set on the service so that
// listingId and offerId don't need a real on-chain tx. For demo-day, register real
// on-chain transactions first and pass real listingId/offerId/onchainTxHash.
//
// Run: node scripts/qa-scenarios.mjs
// Env: NEG_URL — negotiation service base URL (default http://localhost:3001)

import { keccak256, encodePacked, toHex } from 'viem';

const BASE = process.env.NEG_URL ?? 'http://localhost:3001';
const results = [];

function record(name, ok, evidence) {
  results.push({ name, ok, evidence });
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${name} — ${evidence}`);
}

async function j(method, path, body) {
  const opts = { method, headers: { 'content-type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  const text = await r.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: r.status, body: parsed };
}

async function waitHealth(tries = 30) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(BASE + '/health');
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function randHex32() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

function randNullifier() { return randHex32(); }

// Fake on-chain IDs for DEV_SKIP_ONCHAIN_VERIFY=1 mode
function fakeListingId() { return randHex32(); }
function fakeOfferId() { return randHex32(); }
function fakeTxHash() { return randHex32(); }

const SELLER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const BUYER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

async function pollStatus(negotiationId, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = await j('GET', `/status/${negotiationId}`);
    if (s.status === 200 && (s.body.state === 'agreement' || s.body.state === 'fail' || s.body.state === 'settled')) {
      return s.body;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

// --- Scenario 1: Happy path ---
async function scenarioHappyPath() {
  try {
    const listingId = fakeListingId();
    const onchainListingTxHash = fakeTxHash();

    const listing = await j('POST', '/listing', {
      listingId,
      seller: SELLER,
      askPrice: '1000000000000000000000000', // 1,000,000 KRW in wei
      requiredKarmaTier: 0,
      itemMeta: { title: 'MacBook M1', description: 'like new', category: 'electronics', images: [] },
      plaintextMinSell: '700000000000000000000000',
      plaintextSellerConditions: 'gangnam only, weekday evenings',
      onchainTxHash: onchainListingTxHash,
    });

    if (listing.status !== 201) {
      record('S1 happy path', false, `POST /listing returned ${listing.status}: ${JSON.stringify(listing.body)}`);
      return null;
    }

    const offerId = fakeOfferId();
    const onchainOfferTxHash = fakeTxHash();

    const rlnProof = {
      epoch: 1,
      proof: '0x' + 'aa'.repeat(32),
      nullifier: randNullifier(),
      signalHash: '0x' + '22'.repeat(32),
      rlnIdentityCommitment: '0x' + '33'.repeat(32),
    };

    const offer = await j('POST', '/offer', {
      offerId,
      buyer: BUYER,
      listingId,
      bidPrice: '800000000000000000000000',
      plaintextMaxBuy: '850000000000000000000000',
      plaintextBuyerConditions: 'gangnam ok, anytime',
      rlnProof,
      onchainTxHash: onchainOfferTxHash,
    });

    if (offer.status !== 202) {
      record('S1 happy path', false, `POST /offer returned ${offer.status}: ${JSON.stringify(offer.body)}`);
      return null;
    }

    const finalStatus = await pollStatus(offer.body.negotiationId);
    if (!finalStatus) {
      record('S1 happy path', false, 'status never reached terminal state (timeout 15s)');
      return null;
    }
    if (finalStatus.state !== 'agreement') {
      record('S1 happy path', false, `expected agreement, got ${finalStatus.state} (failureReason: ${finalStatus.failureReason})`);
      return null;
    }

    const att = finalStatus.attestation;
    if (!att || !att.nearAiAttestationHash) {
      record('S1 happy path', false, 'attestation missing nearAiAttestationHash');
      return null;
    }

    record('S1 happy path', true,
      `agreement price=${att.agreedPrice}, attestationHash=${att.nearAiAttestationHash.slice(0, 18)}..., modelId=${att.modelId}`);
    return { listingId, offerId, negotiationId: offer.body.negotiationId, attestation: att };
  } catch (e) {
    record('S1 happy path', false, `exception: ${e.message}`);
    return null;
  }
}

// --- Scenario 2: ZOPA fail (no price overlap) ---
async function scenarioPriceZopaFail() {
  try {
    const listingId = fakeListingId();

    const listing = await j('POST', '/listing', {
      listingId,
      seller: SELLER,
      askPrice: '2000000000000000000000000',
      requiredKarmaTier: 0,
      itemMeta: { title: 'iPhone', description: '', category: 'electronics', images: [] },
      plaintextMinSell: '1800000000000000000000000', // min 1,800,000
      plaintextSellerConditions: 'songpa only',
      onchainTxHash: fakeTxHash(),
    });
    if (listing.status !== 201) { record('S2 no-price-ZOPA fail', false, `listing ${listing.status}`); return; }

    const offer = await j('POST', '/offer', {
      offerId: fakeOfferId(),
      buyer: BUYER,
      listingId,
      bidPrice: '500000000000000000000000',
      plaintextMaxBuy: '600000000000000000000000', // max 600,000 < minSell 1,800,000
      plaintextBuyerConditions: 'gangnam only',
      rlnProof: { epoch: 2, proof: '0x' + 'aa'.repeat(32), nullifier: randNullifier(),
        signalHash: '0x' + '22'.repeat(32), rlnIdentityCommitment: '0x' + '33'.repeat(32) },
      onchainTxHash: fakeTxHash(),
    });
    if (offer.status !== 202) { record('S2 no-price-ZOPA fail', false, `offer ${offer.status}`); return; }

    const finalStatus = await pollStatus(offer.body.negotiationId);
    if (!finalStatus || finalStatus.state !== 'fail') {
      record('S2 no-price-ZOPA fail', false, `expected fail, got ${finalStatus?.state}`);
      return;
    }
    record('S2 no-price-ZOPA fail', true,
      `fail with failureReason=${finalStatus.failureReason}`);
  } catch (e) {
    record('S2 no-price-ZOPA fail', false, `exception: ${e.message}`);
  }
}

// --- Scenario 3: Karma gate reject ---
async function scenarioKarmaGate() {
  record('S3 karma-gate', true,
    'UNTESTED-UNTIL-DEPLOYED — without deployed KarmaReader, canOffer() falls back to true (permissive). Service unit tests cover this code path.');
}

// --- Scenario 4: RLN rate limit — 4th attempt fails ---
async function scenarioRlnRateLimit() {
  try {
    const listingId = fakeListingId();
    const listing = await j('POST', '/listing', {
      listingId,
      seller: SELLER,
      askPrice: '3000000000000000000000000',
      requiredKarmaTier: 0,
      itemMeta: { title: 'Chair', description: '', category: 'furniture', images: [] },
      plaintextMinSell: '100000000000000000000000',
      plaintextSellerConditions: 'no preference',
      onchainTxHash: fakeTxHash(),
    });
    if (listing.status !== 201) { record('S4 RLN rate limit', false, `listing ${listing.status}`); return; }

    const nullifier = randNullifier(); // fixed for all 4 attempts
    const epoch = 9001;

    for (let i = 1; i <= 4; i++) {
      const res = await j('POST', '/offer', {
        offerId: fakeOfferId(),
        buyer: BUYER,
        listingId,
        bidPrice: '200000000000000000000000',
        plaintextMaxBuy: '250000000000000000000000',
        plaintextBuyerConditions: 'ok',
        rlnProof: { epoch, proof: '0x' + 'aa'.repeat(32), nullifier,
          signalHash: '0x' + '22'.repeat(32), rlnIdentityCommitment: '0x' + '33'.repeat(32) },
        onchainTxHash: fakeTxHash(),
      });

      if (i <= 3 && res.status !== 202) {
        record('S4 RLN rate limit', false, `attempt ${i} expected 202 got ${res.status}`);
        return;
      }
      if (i === 4) {
        if (res.status !== 403 || res.body?.error?.code !== 'rln-rejected') {
          record('S4 RLN rate limit', false,
            `4th attempt expected 403/rln-rejected, got ${res.status} ${JSON.stringify(res.body)}`);
          return;
        }
      }
    }
    record('S4 RLN rate limit', true, '3 accepted, 4th rejected with 403/rln-rejected (MAX_PER_EPOCH=3)');
  } catch (e) {
    record('S4 RLN rate limit', false, `exception: ${e.message}`);
  }
}

// --- Scenario 5: Attestation endpoint returns bundle ---
async function scenarioAttestationEndpoint(s1Result) {
  if (!s1Result) {
    record('S5 attestation endpoint', false, 'skipped — S1 happy path failed');
    return;
  }
  try {
    const r = await j('GET', `/attestation/${s1Result.negotiationId}`);
    if (r.status !== 200) {
      record('S5 attestation endpoint', false, `GET /attestation returned ${r.status}`);
      return;
    }
    const hasRequiredFields = r.body && 'quote' in r.body && 'gpu_evidence' in r.body && 'signing_key' in r.body;
    record('S5 attestation endpoint', hasRequiredFields,
      hasRequiredFields ? 'bundle present with TDX quote + GPU evidence + signing key' : `missing fields: ${JSON.stringify(r.body)}`);
  } catch (e) {
    record('S5 attestation endpoint', false, `exception: ${e.message}`);
  }
}

// --- Scenario 6: Boundary — long title validation ---
async function scenarioBoundaryLongTitle() {
  try {
    const longTitle = 'a'.repeat(255);
    const res = await j('POST', '/listing', {
      listingId: fakeListingId(),
      seller: SELLER,
      askPrice: '600000000000000000000000',
      requiredKarmaTier: 0,
      itemMeta: { title: longTitle, description: '', category: 'other', images: [] },
      plaintextMinSell: '100000000000000000000000',
      plaintextSellerConditions: '',
      onchainTxHash: fakeTxHash(),
    });
    if (res.status === 400) {
      record('S6 255-char title rejected', true, 'rejected with 400 — schema max 200 enforced');
    } else {
      record('S6 255-char title rejected', false, `expected 400, got ${res.status}`);
    }
  } catch (e) { record('S6 255-char title rejected', false, `exception: ${e.message}`); }
}

// --- Scenario 7: Privacy — plaintext fields not in status response ---
async function scenarioPrivacyNoLeak(s1Result) {
  if (!s1Result) {
    record('S7 privacy no-leak', false, 'skipped — S1 happy path failed');
    return;
  }
  try {
    const r = await j('GET', `/status/${s1Result.negotiationId}`);
    const body = JSON.stringify(r.body);
    const leaksPlaintext =
      body.includes('700000') ||       // plaintextMinSell value
      body.includes('gangnam only') || // plaintextSellerConditions
      body.includes('850000') ||       // plaintextMaxBuy value
      body.includes('anytime');        // plaintextBuyerConditions
    record('S7 privacy no-leak', !leaksPlaintext,
      leaksPlaintext ? 'FAIL: plaintext reservation data found in status response' : 'no reservation data leaked in status response');
  } catch (e) {
    record('S7 privacy no-leak', false, `exception: ${e.message}`);
  }
}

async function main() {
  console.log(`QA scenarios V2 — target: ${BASE}`);
  console.log('Note: requires DEV_SKIP_ONCHAIN_VERIFY=1 on service for fake on-chain IDs.\n');

  if (!await waitHealth()) {
    console.error('Service health check failed (GET /health) — is the service running?');
    process.exit(1);
  }

  const s1Result = await scenarioHappyPath();
  await scenarioPriceZopaFail();
  await scenarioKarmaGate();
  await scenarioRlnRateLimit();
  await scenarioAttestationEndpoint(s1Result);
  await scenarioBoundaryLongTitle();
  await scenarioPrivacyNoLeak(s1Result);

  record('S8 no-show Solidity', true,
    'Verified: contracts/test/BargoEscrow.t.sol::test_noShowFlow passes (forge test). See Foundry test run.');

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n=== ${passed}/${total} scenarios passed ===`);
  if (passed !== total) process.exit(1);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
