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

// Fixed agreed conditions (see PLAN §5.1)
const FIXED_AGREED_CONDITIONS = {
  location: 'gangnam',
  meetTimeIso: '2026-04-20T19:00:00+09:00',
  payment: 'cash' as const,
};

function hexToUint8Array(hex: `0x${string}`): Uint8Array {
  return hexToBytes(hex);
}

function uint8ArrayToHex(bytes: Uint8Array): `0x${string}` {
  return toHex(bytes);
}

// Build 64-byte AAD from listingId + offerId (both bytes32)
function buildAad(listingId: `0x${string}`, offerId: `0x${string}`): Uint8Array {
  const aad = new Uint8Array(64);
  aad.set(hexToUint8Array(listingId), 0);
  aad.set(hexToUint8Array(offerId), 32);
  return aad;
}

// Build 64-byte AAD for listing creation (offerId unknown → 32 zero bytes)
function buildAadListingOnly(listingId: `0x${string}`): Uint8Array {
  const aad = new Uint8Array(64);
  aad.set(hexToUint8Array(listingId), 0);
  return aad;
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
      const { listingId, offerId, nonce } = req;

      // Decrypt min_sell (AAD: listingId + zeros, since it was encrypted without offerId)
      let minSellStr: string;
      let maxBuyStr: string;
      try {
        const minSellBytes = open({
          privateKey: mockTeeSk,
          blob: req.encMinSell,
          aad: buildAadListingOnly(listingId),
        });
        minSellStr = new TextDecoder().decode(minSellBytes);

        const maxBuyBytes = open({
          privateKey: mockTeeSk,
          blob: req.encMaxBuy,
          aad: buildAad(listingId, offerId),
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

      const minSell = BigInt(minSellStr.trim());
      const maxBuy = BigInt(maxBuyStr.trim());

      const ts = Math.floor(Date.now() / 1000);

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
