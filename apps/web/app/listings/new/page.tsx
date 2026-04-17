'use client';

import { ConditionInput } from '@/components/ConditionInput';
import { PriceInput } from '@/components/PriceInput';
import { NetworkGuard } from '@/components/NetworkGuard';
import { WalletConnect } from '@/components/WalletConnect';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { usePostListing, useServicePubkey } from '@/lib/api';
import { krwToWei } from '@/lib/format';
import { lineaEstimateGas } from '@/lib/linea-estimate';
import { sealConditions, sealReservationPrice } from '@/lib/seal';
import type { Hex, KarmaTier } from '@bargo/shared';
import { ADDRESSES, bargoEscrowAbi } from '@bargo/shared';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { encodeFunctionData, keccak256, parseEventLogs, toHex } from 'viem';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';

const CATEGORIES = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'fashion', label: 'Fashion / Apparel' },
  { value: 'furniture', label: 'Furniture / Home' },
  { value: 'other', label: 'Other' },
] as const;

const KARMA_TIERS: { value: KarmaTier; label: string }[] = [
  { value: 0, label: 'Tier 0 — Anyone' },
  { value: 1, label: 'Tier 1 — Regular or above' },
  { value: 2, label: 'Tier 2 — Trusted or above' },
  { value: 3, label: 'Tier 3 — Elite only' },
];

const HOODI_CHAIN_ID = 374;

export default function NewListingPage() {
  const router = useRouter();
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const postListing = usePostListing();
  const { writeContractAsync } = useWriteContract();

  const { data: servicePubkey } = useServicePubkey();
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [category, setCategory] =
    React.useState<(typeof CATEGORIES)[number]['value']>('electronics');
  const [minPriceKrw, setMinPriceKrw] = React.useState('');
  const [conditions, setConditions] = React.useState('');
  const [requiredTier, setRequiredTier] = React.useState<KarmaTier>(0);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitStep, setSubmitStep] = React.useState<'idle' | 'onchain' | 'service'>('idle');

  const escrowAddress = ADDRESSES[HOODI_CHAIN_ID]?.bargoEscrow;

  const canSubmit =
    isConnected &&
    !!address &&
    title.trim().length > 0 &&
    minPriceKrw.length > 0 &&
    !isSubmitting &&
    !!servicePubkey;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !address) return;

    setIsSubmitting(true);
    setSubmitStep('onchain');

    // Capture sensitive values to locals and clear state BEFORE submission.
    // This prevents plaintext lingering in React state on error.
    const rawMin = minPriceKrw;
    const rawCond = conditions;
    setMinPriceKrw('');
    setConditions('');

    try {
      const minPriceWei = krwToWei(rawMin);

      if (!servicePubkey?.pubkey) {
        throw new Error(
          'Service pubkey not available. Make sure the negotiation service is running.',
        );
      }

      const itemMeta = {
        title: title.trim(),
        description: description.trim(),
        category,
        images: [] as string[],
      };

      // Compute itemMetaHash: keccak256 of canonical JSON
      const itemMetaHash = keccak256(toHex(JSON.stringify(itemMeta))) as Hex;

      if (!escrowAddress) {
        throw new Error('Contract address not configured. Check docs/deployments.md.');
      }

      // Step 1: On-chain registerListing (V3 sealed-bid — no askPrice arg).
      toast.info('Approve the transaction in your wallet...');
      const callArgs = [requiredTier, itemMetaHash] as const;
      const data = encodeFunctionData({
        abi: bargoEscrowAbi,
        functionName: 'registerListing',
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
        functionName: 'registerListing',
        args: callArgs,
        gas: gasFields.gas,
        maxFeePerGas: gasFields.maxFeePerGas,
        maxPriorityFeePerGas: gasFields.maxPriorityFeePerGas,
      });

      toast.info('Confirming transaction...');

      // Step 2: Wait for receipt + parse ListingCreated event
      const receipt = await publicClient?.waitForTransactionReceipt({ hash: txHash });

      const logs = parseEventLogs({
        abi: bargoEscrowAbi,
        eventName: 'ListingCreated',
        logs: receipt.logs,
      });

      const firstLog = logs[0];
      if (!firstLog) {
        throw new Error('ListingCreated event not found. Check your transaction.');
      }

      const listingId = (firstLog.args as { listingId: Hex }).listingId;
      toast.success('On-chain registration confirmed!');

      // Step 3: Seal reservation + conditions, then POST
      setSubmitStep('service');
      const encMinSell = sealReservationPrice({
        servicePubkey: servicePubkey.pubkey,
        listingId,
        reservationWei: minPriceWei,
      });
      const encSellerConditions = sealConditions({
        servicePubkey: servicePubkey.pubkey,
        listingId,
        conditions: rawCond.trim().slice(0, 2048),
      });

      const result = await postListing.mutateAsync({
        listingId,
        seller: address,
        requiredKarmaTier: requiredTier,
        itemMeta,
        encMinSell,
        encSellerConditions,
        onchainTxHash: txHash,
      });

      toast.success('Listing created!');
      router.push(`/listings/${result.listingId}`);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[listings/new] submit error:', err);
      }
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('User rejected') || msg.includes('user rejected')) {
        toast.error('Transaction cancelled.');
      } else if (msg.includes('Contract address')) {
        toast.error(msg);
      } else {
        toast.error('Failed to create listing. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
      setSubmitStep('idle');
    }
  }

  function submitLabel() {
    if (!isSubmitting) return 'Create listing';
    if (submitStep === 'onchain') return 'Registering on-chain...';
    if (submitStep === 'service') return 'Saving to service...';
    return 'Creating...';
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
        <p className="text-xl font-semibold">Connect your wallet to create a listing</p>
        <WalletConnect />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Create listing</h1>
        <WalletConnect />
      </div>

      <NetworkGuard />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="title" className="text-sm font-medium">
                Title{' '}
                <span className="text-destructive" aria-hidden="true">
                  *
                </span>
              </label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="MacBook M1 Pro 14-inch"
                maxLength={200}
                required
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Condition, accessories, notes"
                maxLength={2000}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="category" className="text-sm font-medium">
                Category
              </label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader>
            <CardTitle>Your floor — sealed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="min-price" className="text-sm font-medium">
                Lowest you'd accept{' '}
                <span className="text-destructive" aria-hidden="true">
                  *
                </span>
              </label>
              <PriceInput
                id="min-price"
                value={minPriceKrw}
                onChange={setMinPriceKrw}
                placeholder="700,000"
                masked
                label="Minimum sell price (KRW)"
              />
              <p className="text-sm text-muted-foreground">
                Processed inside <strong>NEAR AI TEE</strong>. Counterparty never sees it. Operator
                sees plaintext for ~15s during negotiation; auto-purged on deal completion.
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
            <label htmlFor="conditions" className="text-sm font-medium block mb-2">
              Natural-language conditions
            </label>
            <ConditionInput
              id="conditions"
              value={conditions}
              onChange={setConditions}
              placeholder="e.g. Gangnam/Songpa in-person only, weekday evenings, no box"
            />
          </CardContent>
        </Card>

        {/* Karma gating */}
        <Card>
          <CardHeader>
            <CardTitle>Required Karma tier</CardTitle>
          </CardHeader>
          <CardContent>
            <label htmlFor="karma-tier" className="text-sm font-medium block mb-2">
              Minimum Karma tier
            </label>
            <select
              id="karma-tier"
              value={requiredTier}
              onChange={(e) => setRequiredTier(Number(e.target.value) as KarmaTier)}
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {KARMA_TIERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground mt-1.5">
              High-value listings (500,000 KRW+) are automatically restricted to Tier 2+ offers by
              the smart contract.
            </p>
          </CardContent>
        </Card>

        {/* Submit — bottom of screen, thumb-reachable */}
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
