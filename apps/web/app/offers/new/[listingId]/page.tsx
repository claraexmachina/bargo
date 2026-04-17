'use client';

import { ConditionInput } from '@/components/ConditionInput';
import { NetworkGuard } from '@/components/NetworkGuard';
import { PriceInput } from '@/components/PriceInput';
import { UserKarma } from '@/components/UserKarma';
import { WalletConnect } from '@/components/WalletConnect';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAckIntentMatch, useListing, usePostOffer, useServicePubkey } from '@/lib/api';
import { krwToWei } from '@/lib/format';
import { lineaEstimateGas } from '@/lib/linea-estimate';
import { buildRLNProof } from '@/lib/rln';
import { sealConditions, sealReservationPrice } from '@/lib/seal';
import type { Hex, IntentId, ListingId } from '@bargo/shared';
import { ADDRESSES, bargoEscrowAbi } from '@bargo/shared';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { encodeFunctionData, parseEventLogs } from 'viem';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';

const HOODI_CHAIN_ID = 374;

export default function NewOfferPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const listingId = params.listingId as ListingId;
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const fromIntent = searchParams.get('fromIntent') as IntentId | null;

  const { data: listing } = useListing(listingId);
  const postOffer = usePostOffer();
  const { data: servicePubkey } = useServicePubkey();
  const ackMatch = useAckIntentMatch();
  const ackMatchRef = React.useRef(ackMatch.mutateAsync);
  ackMatchRef.current = ackMatch.mutateAsync;

  // Acknowledge the intent match on mount when arriving from an intent notification.
  React.useEffect(() => {
    if (fromIntent && listingId) {
      void ackMatchRef.current({ intentId: fromIntent, listingId });
    }
  }, [fromIntent, listingId]);

  const [maxPriceKrw, setMaxPriceKrw] = React.useState('');
  const [conditions, setConditions] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitStep, setSubmitStep] = React.useState<'idle' | 'onchain' | 'service'>('idle');

  const escrowAddress = ADDRESSES[HOODI_CHAIN_ID]?.bargoEscrow;

  const canSubmit =
    isConnected && !!address && maxPriceKrw.length > 0 && !isSubmitting && !!servicePubkey;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !address) return;

    setIsSubmitting(true);
    setSubmitStep('onchain');

    // Capture sensitive values to locals and clear state BEFORE submission.
    // This prevents plaintext lingering in React state on error.
    const rawMax = maxPriceKrw;
    const rawCond = conditions;
    setMaxPriceKrw('');
    setConditions('');

    try {
      const maxPriceWei = krwToWei(rawMax);
      const maxPriceBigInt = BigInt(maxPriceWei);

      if (!servicePubkey?.pubkey) {
        throw new Error(
          'Service pubkey not available. Make sure the negotiation service is running.',
        );
      }

      // Build RLN proof — signal is keyed to (listingId, ceiling, epoch). The
      // ceiling never leaves the client in plaintext; only its ZK signal does.
      const rlnProof = buildRLNProof({
        listingId,
        bidPriceWei: maxPriceBigInt,
        walletAddress: address,
      });

      if (!escrowAddress) {
        throw new Error('Contract address not configured. Check docs/deployments.md.');
      }

      // Step 1: On-chain submitOffer (V3 sealed-bid — no bidPrice arg).
      toast.info('Approve the transaction in your wallet...');
      const rlnProofBytes = rlnProof.proof as Hex;
      const callArgs = [listingId, rlnProofBytes] as const;
      const data = encodeFunctionData({
        abi: bargoEscrowAbi,
        functionName: 'submitOffer',
        args: callArgs,
      });
      const gasFields = await lineaEstimateGas(publicClient!, {
        from: address,
        to: escrowAddress,
        data,
      });

      const txHash = await writeContractAsync({
        address: escrowAddress,
        abi: bargoEscrowAbi,
        functionName: 'submitOffer',
        args: callArgs,
        gas: gasFields.gas,
        maxFeePerGas: gasFields.maxFeePerGas,
        maxPriorityFeePerGas: gasFields.maxPriorityFeePerGas,
      });

      toast.info('Confirming transaction...');

      // Step 2: Wait for receipt + parse OfferSubmitted event
      const receipt = await publicClient?.waitForTransactionReceipt({ hash: txHash });

      const logs = parseEventLogs({
        abi: bargoEscrowAbi,
        eventName: 'OfferSubmitted',
        logs: receipt.logs,
      });

      const firstLog = logs[0];
      if (!firstLog) {
        throw new Error('OfferSubmitted event not found. Check your transaction.');
      }

      const offerId = (firstLog.args as { offerId: Hex }).offerId;
      toast.success('Offer registered on-chain!');

      // Step 3: Seal ceiling + conditions to service pubkey, then POST
      setSubmitStep('service');
      const encMaxBuy = sealReservationPrice({
        servicePubkey: servicePubkey.pubkey,
        listingId,
        reservationWei: maxPriceWei,
      });
      const encBuyerConditions = sealConditions({
        servicePubkey: servicePubkey.pubkey,
        listingId,
        conditions: rawCond.trim().slice(0, 2048),
      });

      const result = await postOffer.mutateAsync({
        offerId,
        buyer: address,
        listingId,
        encMaxBuy,
        encBuyerConditions,
        rlnProof,
        onchainTxHash: txHash,
      });

      toast.success('Offer submitted! Starting negotiation...');
      router.push(`/deals/${result.negotiationId}?listingId=${listingId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (process.env.NODE_ENV === 'development') {
        console.error('[offers/new] submit error:', err);
      }
      if (msg.includes('User rejected') || msg.includes('user rejected')) {
        toast.error('Transaction cancelled.');
      } else if (msg.includes('Contract address')) {
        toast.error(msg);
      } else if (msg.includes('karma') || msg.includes('403') || msg.includes('KarmaTier')) {
        toast.error('Insufficient Karma tier. Cannot offer on this listing.');
      } else if (msg.includes('rln') || msg.includes('nullifier') || msg.includes('RLN')) {
        toast.error('RLN check failed — too many offers on this listing.');
      } else {
        toast.error('Failed to submit offer. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
      setSubmitStep('idle');
    }
  }

  function submitLabel() {
    if (!isSubmitting) return 'Submit offer';
    if (submitStep === 'onchain') return 'Registering on-chain...';
    if (submitStep === 'service') return 'Saving to service...';
    return 'Submitting...';
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
        <p className="text-xl font-semibold">Connect your wallet to submit an offer</p>
        <WalletConnect />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Submit offer</h1>
          {listing && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {listing.itemMeta.title} — sealed bid
            </p>
          )}
          {address && (
            <div className="flex items-center gap-2 mt-1">
              <code className="text-xs bg-muted px-2 py-1 rounded">
                {address.slice(0, 8)}...{address.slice(-4)}
              </code>
              <UserKarma address={address} showLabel />
            </div>
          )}
        </div>
        <WalletConnect />
      </div>

      {fromIntent && (
        <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Matched your standing intent — enter your offer below to proceed.
          </p>
        </div>
      )}

      <NetworkGuard />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Bid price */}
        <Card>
          <CardHeader>
            <CardTitle>Your ceiling — sealed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="max-price" className="text-sm font-medium">
                Maximum you'd pay{' '}
                <span className="text-destructive" aria-hidden="true">
                  *
                </span>
              </label>
              <PriceInput
                id="max-price"
                value={maxPriceKrw}
                onChange={setMaxPriceKrw}
                placeholder="e.g. 750,000"
                masked
                label="Maximum buy price (KRW)"
              />
              <p className="text-sm text-muted-foreground">
                Sealed with the service's X25519 pubkey before leaving your browser. Decrypted only
                inside <strong>NEAR AI TEE</strong>. The counterparty never sees it; the only price
                ever revealed is the final agreed settlement.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Conditions */}
        <Card>
          <CardHeader>
            <CardTitle>Conditions (private)</CardTitle>
          </CardHeader>
          <CardContent>
            <label htmlFor="buyer-conditions" className="text-sm font-medium block mb-2">
              Natural-language conditions
            </label>
            <ConditionInput
              id="buyer-conditions"
              value={conditions}
              onChange={setConditions}
              placeholder="e.g. Gangnam area OK, weekends only, card payment accepted"
            />
          </CardContent>
        </Card>

        {/* RLN notice */}
        <div className="rounded-md bg-muted/50 border px-4 py-3 text-xs text-muted-foreground">
          An RLN (Rate Limiting Nullifier) proof is attached automatically. More than 3 offers on
          the same listing within 5 minutes will be rejected (anti-spam).
        </div>

        {/* Bottom bar */}
        <div
          className="sticky bottom-0 bg-background/95 backdrop-blur border-t p-4 flex gap-3"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit} className="flex-1" size="lg">
            {submitLabel()}
          </Button>
        </div>
      </form>
    </div>
  );
}
