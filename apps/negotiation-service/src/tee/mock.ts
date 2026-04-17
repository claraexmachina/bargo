// Mock TEE — activated when MOCK_TEE=1.
// Implements the same TeeClient interface as client.ts.
// Uses MOCK_TEE_SK (X25519) to decrypt blobs and MOCK_TEE_SIGNER_SK (secp256k1) to sign.
//
// DEMO ONLY. Keys are committed in .env.example for hackathon convenience.
// Remove enclaveId from ENCLAVE_SIGNERS before any production deploy.
//
// Mock logic per PLAN §5.1:
//   - Decrypt min_sell and max_buy with MOCK_TEE_SK
//   - If max_buy >= min_sell → agreement at midpoint
//   - Else → fail with reasonHash = keccak256("no_price_zopa")
// Fixed agreed conditions: { location:"gangnam", meetTimeIso:"2026-04-20T19:00:00+09:00", payment:"cash" }

import { open } from '@haggle/crypto';
import { keccak256, encodePacked, toBytes, toHex, hexToBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { TeeAttestation, TeeAgreement, TeeFailure, GetTeePubkeyResponse } from '@haggle/shared';
import type { TeeClient, NegotiateRequest } from './client.js';
import { x25519 } from '@noble/curves/ed25519';

// Fixed mock enclave identity
const MOCK_ENCLAVE_ID: `0x${string}` =
  '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
const MOCK_MODEL_ID = 'mock-tee/no-llm@demo-only';
const MOCK_WHITELISTED_AT = 1_700_000_000; // arbitrary past timestamp

// Location tokens for condition matching
const LOCATION_TOKENS = ['강남', '송파', '홍대', '신촌', '이태원'];
// Weekday tokens (평일-compatible)
const WEEKDAY_TOKENS = ['평일', '월요일', '화요일', '수요일', '목요일', '금요일'];
// Weekend tokens (주말-compatible)
const WEEKEND_TOKENS = ['주말', '토요일', '토요', '일요일', '일요'];
// Payment tokens
const PAYMENT_TOKENS = ['현금', '카드', '이체'];

/** Normalize a conditions string: lowercase, whitespace stripped */
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}

/**
 * Returns true if any token from the list appears in the normalized text.
 */
function hasAny(text: string, tokens: string[]): boolean {
  return tokens.some((t) => text.includes(t));
}

/**
 * Check whether seller and buyer conditions are compatible.
 * Empty string on either side means "no preference" on that axis → always compatible.
 * Returns true if compatible, false if incompatible.
 */
function conditionsCompatible(sellerConds: string, buyerConds: string): boolean {
  if (!sellerConds.trim() || !buyerConds.trim()) return true;

  const s = normalize(sellerConds);
  const b = normalize(buyerConds);

  // Location axis: if seller mentions any location tokens, buyer must overlap
  const sellerHasLocation = hasAny(s, LOCATION_TOKENS);
  const buyerHasLocation = hasAny(b, LOCATION_TOKENS);
  if (sellerHasLocation && buyerHasLocation) {
    const overlap = LOCATION_TOKENS.some((t) => s.includes(t) && b.includes(t));
    if (!overlap) return false;
  }

  // Time axis: if seller wants weekday only, buyer must not be weekend-only
  const sellerWantsWeekday = hasAny(s, WEEKDAY_TOKENS);
  const sellerWantsWeekend = hasAny(s, WEEKEND_TOKENS);
  const buyerWantsWeekday = hasAny(b, WEEKDAY_TOKENS);
  const buyerWantsWeekend = hasAny(b, WEEKEND_TOKENS);

  if (sellerWantsWeekday && !sellerWantsWeekend && buyerWantsWeekend && !buyerWantsWeekday) {
    return false;
  }
  if (sellerWantsWeekend && !sellerWantsWeekday && buyerWantsWeekday && !buyerWantsWeekend) {
    return false;
  }

  return true;
}

/**
 * Compute the next Friday at 19:30 KST as an ISO string.
 * Always returns a future time so demo timestamps stay valid.
 */
function nextFriday1930KST(): string {
  const now = new Date();
  // Offset to Korea/Seoul (UTC+9)
  const kstOffset = 9 * 60; // minutes
  const kstNow = new Date(now.getTime() + (kstOffset - now.getTimezoneOffset()) * 60_000);
  const dayOfWeek = kstNow.getUTCDay(); // 0=Sun, 5=Fri
  const daysUntilFriday = ((5 - dayOfWeek + 7) % 7) || 7; // at least 1 day ahead
  const friday = new Date(kstNow);
  friday.setUTCDate(kstNow.getUTCDate() + daysUntilFriday);
  friday.setUTCHours(10, 30, 0, 0); // 19:30 KST = 10:30 UTC
  return friday.toISOString().replace('Z', '+09:00').replace(/\.\d{3}\+09:00$/, '+09:00');
}

// Fixed agreed conditions (see PLAN §5.1)
const FIXED_AGREED_CONDITIONS = {
  location: '강남역 8번출구',
  get meetTimeIso() { return nextFriday1930KST(); },
  payment: 'cash' as const,
};

function hexToUint8Array(hex: `0x${string}`): Uint8Array {
  return hexToBytes(hex);
}

function uint8ArrayToHex(bytes: Uint8Array): `0x${string}` {
  return toHex(bytes);
}

// Build 32-byte AAD = listingId bytes only.
// All 4 blobs (encMinSell, encSellerConditions, encMaxBuy, encBuyerConditions)
// use this convention. offerId binding is at the REST transport layer.
// See PLAN §3.5 (updated).
function buildAad(listingId: `0x${string}`): Uint8Array {
  return hexToUint8Array(listingId);
}

export function createMockTeeClient(
  mockTeeSk: `0x${string}`,
  mockTeeSignerSk: `0x${string}`,
): TeeClient {
  const skBytes = hexToUint8Array(mockTeeSk);
  const pubkeyBytes = x25519.getPublicKey(skBytes);
  const pubkeyHex = uint8ArrayToHex(pubkeyBytes);

  const signerAccount = privateKeyToAccount(mockTeeSignerSk);
  const signerAddress = signerAccount.address;

  async function signPayload(payload: TeeAgreement | TeeFailure): Promise<`0x${string}`> {
    // Sign canonical JSON of payload with secp256k1 (EIP-191 personal_sign)
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    const sig = await signerAccount.signMessage({ message: canonical });
    return sig;
  }

  return {
    async negotiate(req: NegotiateRequest): Promise<TeeAttestation> {
      const { listingId, offerId, nonce } = req; // offerId used in attestation payloads only

      // Decrypt min_sell and max_buy — both use AAD = listingId (32 bytes).
      // See PLAN §3.5 (updated): offerId is NOT part of AEAD.
      let minSellStr: string;
      let maxBuyStr: string;
      try {
        const minSellBytes = open({
          privateKey: mockTeeSk,
          blob: req.encMinSell,
          aad: buildAad(listingId),
        });
        minSellStr = new TextDecoder().decode(minSellBytes);

        const maxBuyBytes = open({
          privateKey: mockTeeSk,
          blob: req.encMaxBuy,
          aad: buildAad(listingId),
        });
        maxBuyStr = new TextDecoder().decode(maxBuyBytes);
      } catch {
        // Decryption failure → fail attestation (don't expose plaintext in error)
        const failPayload: TeeFailure = {
          listingId,
          offerId,
          reasonHash: keccak256(toBytes('decryption_failed')),
          modelId: MOCK_MODEL_ID,
          enclaveId: MOCK_ENCLAVE_ID,
          ts: Math.floor(Date.now() / 1000),
          nonce,
        };
        const signature = await signPayload(failPayload);
        return { payload: failPayload, result: 'fail', signature, signerAddress };
      }

      // Decrypt seller and buyer conditions — both use AAD = listingId (32 bytes).
      let sellerCondStr = '';
      let buyerCondStr = '';
      try {
        const sellerCondBytes = open({
          privateKey: mockTeeSk,
          blob: req.encSellerConditions,
          aad: buildAad(listingId),
        });
        sellerCondStr = new TextDecoder().decode(sellerCondBytes);
      } catch { /* no preference */ }
      try {
        const buyerCondBytes = open({
          privateKey: mockTeeSk,
          blob: req.encBuyerConditions,
          aad: buildAad(listingId),
        });
        buyerCondStr = new TextDecoder().decode(buyerCondBytes);
      } catch { /* no preference */ }

      const minSell = BigInt(minSellStr.trim());
      const maxBuy = BigInt(maxBuyStr.trim());

      const ts = Math.floor(Date.now() / 1000);

      // Condition check first: if conditions are incompatible, fail regardless of ZOPA
      if (!conditionsCompatible(sellerCondStr, buyerCondStr)) {
        const failPayload: TeeFailure = {
          listingId,
          offerId,
          reasonHash: keccak256(toBytes('conditions_incompatible')),
          modelId: MOCK_MODEL_ID,
          enclaveId: MOCK_ENCLAVE_ID,
          ts,
          nonce,
        };
        const signature = await signPayload(failPayload);
        return { payload: failPayload, result: 'fail', signature, signerAddress };
      }

      if (maxBuy < minSell) {
        const failPayload: TeeFailure = {
          listingId,
          offerId,
          reasonHash: keccak256(toBytes('no_price_zopa')),
          modelId: MOCK_MODEL_ID,
          enclaveId: MOCK_ENCLAVE_ID,
          ts,
          nonce,
        };
        const signature = await signPayload(failPayload);
        return { payload: failPayload, result: 'fail', signature, signerAddress };
      }

      // Midpoint agreed price
      const agreedPrice = ((minSell + maxBuy) / 2n).toString();

      const agreementPayload: TeeAgreement = {
        listingId,
        offerId,
        agreedPrice,
        agreedConditions: FIXED_AGREED_CONDITIONS,
        modelId: MOCK_MODEL_ID,
        enclaveId: MOCK_ENCLAVE_ID,
        ts,
        nonce,
      };
      const signature = await signPayload(agreementPayload);
      return { payload: agreementPayload, result: 'agreement', signature, signerAddress };
    },

    async getPubkey(): Promise<GetTeePubkeyResponse> {
      return {
        pubkey: pubkeyHex,
        enclaveId: MOCK_ENCLAVE_ID,
        modelId: MOCK_MODEL_ID,
        signerAddress,
        whitelistedAt: MOCK_WHITELISTED_AT,
      };
    },

    async health() {
      return { ok: true, enclaveId: MOCK_ENCLAVE_ID, modelId: MOCK_MODEL_ID };
    },
  };
}
