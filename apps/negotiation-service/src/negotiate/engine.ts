// Negotiation engine — orchestrates PLAN_V2 §2.2 steps A→J.
// Pure async function; no side effects except DB writes + disk writes.

import { toBytes } from 'viem';
import { keccak256 } from 'viem';
// @ts-ignore — canonicalize has no bundled types
import canonicalize from 'canonicalize';
import type { DealId, ListingId, OfferId, KarmaTier, NearAiAttestation, NearAiAttestationBundle, AgreedConditions, FailureReason } from '@bargo/shared';
import { parseConditionsPair, LLMTimeoutError } from '../nearai/client.js';
import { fetchAttestation, saveAttestationBundle } from '../nearai/attestation.js';
import { matchConditions } from './conditions.js';
import { computeAgreedPrice } from './karmaWeight.js';

export interface RunNegotiationOpts {
  dealId: DealId;
  listingId: ListingId;
  offerId: OfferId;
  listingTitle: string;
  sellerPlaintextMin: string;          // wei decimal
  sellerPlaintextConditions: string;
  buyerPlaintextMax: string;           // wei decimal
  buyerPlaintextConditions: string;
  sellerKarmaTier: KarmaTier;
  buyerKarmaTier: KarmaTier;
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
  // A. ZOPA check
  const sellerMin = BigInt(opts.sellerPlaintextMin);
  const buyerMax = BigInt(opts.buyerPlaintextMax);

  if (buyerMax < sellerMin) {
    return { kind: 'fail', reason: 'no_price_zopa' };
  }

  // B+C. Call NEAR AI to parse conditions
  let completionId: string;
  let sellerConditions: import('@bargo/shared').ConditionStruct;
  let buyerConditions: import('@bargo/shared').ConditionStruct;

  try {
    const parsed = await parseConditionsPair({
      listingTitle: opts.listingTitle,
      sellerText: opts.sellerPlaintextConditions,
      buyerText: opts.buyerPlaintextConditions,
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

  // D. Match conditions
  const matchResult = matchConditions(sellerConditions, buyerConditions);
  if (!matchResult.compatible) {
    return { kind: 'fail', reason: 'conditions_incompatible' };
  }

  const agreedConditions = matchResult.agreed;

  // E. Compute karma-weighted price
  const agreedPriceWei = computeAgreedPrice(
    sellerMin,
    buyerMax,
    opts.sellerKarmaTier,
    opts.buyerKarmaTier,
  );

  // F. Fetch NEAR AI attestation
  const { bundle, bundleHash, nonce } = await fetchAttestation({
    model: opts.nearAiModel,
    dealId: opts.dealId,
    completionId,
    apiKey: opts.nearAiApiKey,
    baseURL: opts.nearAiBaseURL,
  });

  // G. Compute agreedConditionsHash = keccak256(canonicalize(AgreedConditions)).
  // Canonicalized JSON (RFC 8785) avoids length-ambiguity of encodePacked on strings
  // and produces a hash verifiable by any standard JSON canonicalizer.
  const agreedConditionsForHash: AgreedConditions = agreedConditions;
  const canonicalConditions = canonicalize(agreedConditionsForHash) as string | undefined;
  if (!canonicalConditions) throw new Error('canonicalize returned undefined for agreedConditions');
  const agreedConditionsHash = keccak256(toBytes(canonicalConditions)) as `0x${string}`;

  // H. Persist attestation bundle to disk
  const attestationBundlePath = saveAttestationBundle(
    opts.attestationDir,
    opts.dealId,
    bundle,
  );

  // I. Build NearAiAttestation — include agreedConditionsHash as a distinct field
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
