/**
 * RLN proof stub.
 * Real Status RLN SDK is not yet confirmed available.
 * This stub produces a proof with the correct interface shape so the contract
 * ABI stays unchanged — swap body only when SDK lands.
 *
 * Interface contract (from PLAN §5.3):
 *   signalHash  = keccak256(abi.encode(listingId, bidPriceWei, epoch))
 *   nullifier   = keccak256(abi.encode(identitySecret, toBytes32(epoch)))
 *   proof       = keccak256(abi.encode(signalHash, nullifier, identitySecret))
 *
 * identitySecret: persistent per-wallet, stored in localStorage under "rln_sk_{address}".
 * If absent, generated once and stored (no export — user must not lose it deliberately).
 */
import type { Hex, ListingId, RLNProof } from '@bargo/shared';
import { RLN_EPOCH_DURATION } from '@bargo/shared';
import { encodeAbiParameters, keccak256, pad, parseAbiParameters } from 'viem';

const IDENTITY_SK_KEY = (address: string) => `rln_sk_${address.toLowerCase()}`;

function getOrCreateIdentitySecret(address: string): Hex {
  const key = IDENTITY_SK_KEY(address);
  const stored = localStorage.getItem(key);
  if (stored && /^0x[0-9a-f]{64}$/.test(stored)) return stored as Hex;

  // Generate a deterministic-looking random secret
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex: Hex = `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;
  localStorage.setItem(key, hex);
  return hex;
}

function toBytes32(n: bigint): Hex {
  return pad(`0x${n.toString(16)}` as Hex, { size: 32 });
}

export function buildRLNProof(params: {
  listingId: ListingId;
  bidPriceWei: bigint;
  walletAddress: string;
}): RLNProof {
  const { listingId, bidPriceWei, walletAddress } = params;
  const epoch = Math.floor(Date.now() / 1000 / RLN_EPOCH_DURATION);
  const identitySecret = getOrCreateIdentitySecret(walletAddress);

  const signalHash = keccak256(
    encodeAbiParameters(parseAbiParameters('bytes32, uint256, uint256'), [
      listingId as `0x${string}`,
      bidPriceWei,
      BigInt(epoch),
    ]),
  );

  const nullifier = keccak256(
    encodeAbiParameters(parseAbiParameters('bytes32, bytes32'), [
      identitySecret as `0x${string}`,
      toBytes32(BigInt(epoch)),
    ]),
  );

  const rlnIdentityCommitment = keccak256(identitySecret as `0x${string}`);

  const proof = keccak256(
    encodeAbiParameters(parseAbiParameters('bytes32, bytes32, bytes32'), [
      signalHash,
      nullifier,
      identitySecret as `0x${string}`,
    ]),
  );

  return {
    epoch,
    proof,
    nullifier,
    signalHash,
    rlnIdentityCommitment,
  };
}
