// Negotiation engine — orchestrates PLAN_V3 §2.2 steps A→J.
// Pure async function; no side effects except DB writes + disk writes.
// Plaintext reservation values are decrypted ephemerally — never logged, never returned.

import type {
  AgreedConditions,
  DealId,
  EncryptedBlob,
  FailureReason,
  Hex,
  KarmaTier,
  ListingId,
  NearAiAttestation,
  NearAiAttestationBundle,
  OfferId,
} from '@bargo/shared';
// @ts-ignore — canonicalize has no bundled types
import canonicalize from 'canonicalize';
import { toBytes } from 'viem';
import { keccak256 } from 'viem';
import { decryptReservationEphemeral } from '../crypto/decryptEphemeral.js';
import { fetchAttestation, saveAttestationBundle } from '../nearai/attestation.js';
import { LLMTimeoutError, parseConditionsPair } from '../nearai/client.js';
import { matchConditions } from './conditions.js';
import { computeAgreedPrice } from './karmaWeight.js';

export interface RunNegotiationOpts {
  dealId: DealId;
  listingId: ListingId;
  offerId: OfferId;
  listingTitle: string;
  encMinSell: EncryptedBlob;
  encSellerConditions: EncryptedBlob;
  encMaxBuy: EncryptedBlob;
  encBuyerConditions: EncryptedBlob;
  sellerKarmaTier: KarmaTier;
  buyerKarmaTier: KarmaTier;
  serviceDecryptSk: Hex;
  // Config injected by caller (avoids circular import of config.ts)
  nearAiApiKey: string;
  nearAiBaseURL: string;
  nearAiModel: string;
  nearAiTimeoutMs: number;
  attestationDir: string;
}

export type NegotiationResult =
  | {
      kind: 'agreement';
      attestation: NearAiAttestation;
      bundle: NearAiAttestationBundle;
      attestationBundlePath: string;
    }
  | {
      kind: 'fail';
      reason: FailureReason;
      partialAttestation?: NearAiAttestation;
    };

export async function runNegotiation(opts: RunNegotiationOpts): Promise<NegotiationResult> {
  // A. Ephemeral decrypt — plaintext lives only in this scope, never logged.
  const { minSellWei, maxBuyWei, sellerConditions: sellerConditionsText, buyerConditions: buyerConditionsText } =
    decryptReservationEphemeral({
      serviceDecryptSk: opts.serviceDecryptSk,
      listingId: opts.listingId,
      encMinSell: opts.encMinSell,
      encSellerConditions: opts.encSellerConditions,
      encMaxBuy: opts.encMaxBuy,
      encBuyerConditions: opts.encBuyerConditions,
    });

  // B. ZOPA check
  if (maxBuyWei < minSellWei) {
    return { kind: 'fail', reason: 'no_price_zopa' };
  }

  // C+D. Call NEAR AI to parse conditions (only external call with plaintext)
  let completionId: string;
  let sellerConditions: import('@bargo/shared').ConditionStruct;
  let buyerConditions: import('@bargo/shared').ConditionStruct;

  try {
    const parsed = await parseConditionsPair({
      listingTitle: opts.listingTitle,
      sellerText: sellerConditionsText,
      buyerText: buyerConditionsText,
      apiKey: opts.nearAiApiKey,
      baseURL: opts.nearAiBaseURL,
      model: opts.nearAiModel,
      timeoutMs: opts.nearAiTimeoutMs,
    });
    sellerConditions = parsed.seller;
    buyerConditions = parsed.buyer;
    completionId = parsed.completionId;
  } catch (err) {
    if (err instanceof LLMTimeoutError) {
      return { kind: 'fail', reason: 'llm_timeout' };
    }
    throw err;
  }

  // E. Match conditions
  const matchResult = matchConditions(sellerConditions, buyerConditions);
  if (!matchResult.compatible) {
    return { kind: 'fail', reason: 'conditions_incompatible' };
  }

  const agreedConditions = matchResult.agreed;

  // F. Compute karma-weighted price
  const agreedPriceWei = computeAgreedPrice(
    minSellWei,
    maxBuyWei,
    opts.sellerKarmaTier,
    opts.buyerKarmaTier,
  );

  // G. Fetch NEAR AI attestation
  const { bundle, bundleHash, nonce } = await fetchAttestation({
    model: opts.nearAiModel,
    dealId: opts.dealId,
    completionId,
    apiKey: opts.nearAiApiKey,
    baseURL: opts.nearAiBaseURL,
  });

  // H. Compute agreedConditionsHash = keccak256(canonicalize(AgreedConditions)).
  const agreedConditionsForHash: AgreedConditions = agreedConditions;
  const canonicalConditions = canonicalize(agreedConditionsForHash) as string | undefined;
  if (!canonicalConditions) throw new Error('canonicalize returned undefined for agreedConditions');
  const agreedConditionsHash = keccak256(toBytes(canonicalConditions)) as `0x${string}`;

  // I. Persist attestation bundle to disk
  const attestationBundlePath = saveAttestationBundle(opts.attestationDir, opts.dealId, bundle);

  // J. Build NearAiAttestation — agreedPrice is the only price ever revealed in logs/responses
  const attestation: NearAiAttestation = {
    dealId: opts.dealId,
    listingId: opts.listingId,
    offerId: opts.offerId,
    agreedPrice: agreedPriceWei.toString(),
    agreedConditions,
    agreedConditionsHash,
    modelId: opts.nearAiModel,
    completionId,
    nonce,
    nearAiAttestationHash: bundleHash,
    attestationBundleUrl: `/attestation/${opts.dealId}`,
    ts: Math.floor(Date.now() / 1000),
  };

  return { kind: 'agreement', attestation, bundle, attestationBundlePath };
}
