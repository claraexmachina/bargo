// Reproduces the web-side encryption bug: apps/web/lib/encrypt.ts seals encMaxBuy
// with offerId defaulting to ZERO_BYTES32, but the mock TEE decrypts with the real
// server-generated offerId. Result: decryption fails → attestation returns 'fail'
// with reasonHash = keccak256("decryption_failed") instead of negotiating the price.

import { seal } from '@haggle/crypto';
import { keccak256, encodePacked, hexToBytes, toHex, toBytes } from 'viem';

const BASE = 'http://localhost:3001';
const SELLER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const BUYER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const ZERO_BYTES32 = '0x' + '00'.repeat(32);

async function j(method, path, body) {
  const r = await fetch(BASE + path, {
    method, headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: r.ok ? await r.json() : await r.text() };
}

function encode(s) { return new TextEncoder().encode(s); }
function buildAad(listingIdHex, offerIdHex) {
  const aad = new Uint8Array(64);
  aad.set(hexToBytes(listingIdHex), 0);
  if (offerIdHex) aad.set(hexToBytes(offerIdHex), 32);
  return aad;
}

const { body: pub } = await j('GET', '/tee-pubkey');
const teePubkey = pub.pubkey;

// 1. Register listing (nonce=1 because fresh DB would need cleanup, but here we
//    simply verify the *offer* failure mode, which doesn't depend on listingId value).
const askPrice = '999' + Date.now();  // unique ask price so hash is unique
const encMinSell = seal({
  teePubkey, plaintext: encode('700000'),
  aad: buildAad(predictListing(SELLER, askPrice, 1), null),
});

function predictListing(seller, ap, nonce) {
  return keccak256(encodePacked(['address','uint256','uint256'], [seller, BigInt(ap), BigInt(nonce)]));
}

// Actually register it to get the real listingId from the server:
const list = await j('POST', '/listing', {
  seller: SELLER, askPrice, requiredKarmaTier: 0,
  itemMeta: { title: 'repro', description: '', category: 'other', images: [] },
  // Re-seal with the correct AAD now that we know listingId (it's fine to reuse — AAD uses zeros for listing-only).
  encMinSell, encSellerConditions: encMinSell,
});
const listingId = list.body.listingId;
console.log('listingId:', listingId);

// Now the "web bug": client seals encMaxBuy with offerId=ZERO instead of real offerId.
const encMaxBuy_BUG = seal({
  teePubkey, plaintext: encode('800000'),
  aad: buildAad(listingId, ZERO_BYTES32),  // <-- simulates apps/web default offerId
});
const encBuyerConditions_BUG = seal({
  teePubkey, plaintext: encode('ok'),
  aad: buildAad(listingId, ZERO_BYTES32),
});

const offer = await j('POST', '/offer', {
  buyer: BUYER, listingId, bidPrice: '800000',
  encMaxBuy: encMaxBuy_BUG, encBuyerConditions: encBuyerConditions_BUG,
  rlnProof: {
    epoch: 12345, proof: '0x'+'aa'.repeat(32),
    nullifier: toHex(crypto.getRandomValues(new Uint8Array(32))),
    signalHash: '0x'+'22'.repeat(32), rlnIdentityCommitment: '0x'+'33'.repeat(32),
  },
});
console.log('offer:', offer.status, JSON.stringify(offer.body));

await new Promise(r => setTimeout(r, 2000));
const status = await j('GET', `/status/${offer.body.negotiationId}`);
console.log('status.state:', status.body.state);
console.log('attestation.result:', status.body.attestation?.result);
if (status.body.attestation?.payload?.reasonHash) {
  const hash = status.body.attestation.payload.reasonHash;
  const decryptFailedHash = keccak256(toBytes('decryption_failed'));
  console.log('reasonHash:', hash);
  console.log('== keccak256("decryption_failed")?', hash === decryptFailedHash);
}
