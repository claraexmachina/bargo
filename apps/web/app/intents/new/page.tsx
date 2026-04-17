'use client';

import { ConditionInput } from '@/components/ConditionInput';
import { PriceInput } from '@/components/PriceInput';
import { WalletConnect } from '@/components/WalletConnect';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePostIntent, useServicePubkey } from '@/lib/api';
import { krwToWei } from '@/lib/format';
import { sealIntentConditions, sealIntentMaxBuy } from '@/lib/seal';
import type { IntentFilters, KarmaTier } from '@bargo/shared';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';

type Category = 'electronics' | 'fashion' | 'furniture' | 'other' | 'any';

const EXPIRE_OPTIONS: { label: string; days: number }[] = [
  { label: '1 day', days: 1 },
  { label: '3 days', days: 3 },
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
];

const TIER_OPTIONS: { label: string; value: KarmaTier | 'any' }[] = [
  { label: 'Any tier', value: 'any' },
  { label: 'Tier 0 only', value: 0 },
  { label: 'Up to tier 1', value: 1 },
  { label: 'Up to tier 2', value: 2 },
  { label: 'Up to tier 3', value: 3 },
];

export default function NewIntentPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { data: servicePubkey } = useServicePubkey();
  const postIntent = usePostIntent();

  const [category, setCategory] = React.useState<Category>('any');
  const [tierCeiling, setTierCeiling] = React.useState<KarmaTier | 'any'>('any');
  const [maxBudgetKrw, setMaxBudgetKrw] = React.useState('');
  const [conditions, setConditions] = React.useState('');
  const [expiresInDays, setExpiresInDays] = React.useState(7);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const canSubmit =
    isConnected && !!address && maxBudgetKrw.length > 0 && !isSubmitting && !!servicePubkey;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !address || !servicePubkey) return;

    setIsSubmitting(true);

    // Capture sensitive values to locals and clear state BEFORE sealing.
    const rawMax = maxBudgetKrw;
    const rawCond = conditions;
    setMaxBudgetKrw('');
    setConditions('');

    try {
      const maxBuyWei = krwToWei(rawMax);

      const encMaxBuy = sealIntentMaxBuy({
        servicePubkey: servicePubkey.pubkey,
        maxBuyWei,
      });

      const encBuyerConditions = sealIntentConditions({
        servicePubkey: servicePubkey.pubkey,
        conditions: rawCond.trim().slice(0, 2048),
      });

      const filters: IntentFilters = {};
      if (category !== 'any') filters.category = category;
      if (tierCeiling !== 'any') filters.requiredKarmaTierCeiling = tierCeiling;

      const expiresAt = Math.floor(Date.now() / 1000) + expiresInDays * 86400;

      await postIntent.mutateAsync({
        buyer: address,
        encMaxBuy,
        encBuyerConditions,
        filters,
        expiresAt,
      });

      toast.success('Standing intent created! Agents are now searching for matches.');
      router.push('/intents');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (process.env.NODE_ENV === 'development') {
        console.error('[intents/new] submit error:', err);
      }
      if (msg.includes('400') || msg.includes('invalid')) {
        toast.error('Invalid intent data. Please check your inputs.');
      } else {
        toast.error('Failed to create intent. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
        <p className="text-xl font-semibold">Connect your wallet to create an intent</p>
        <WalletConnect />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">New standing intent</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Agents discover listings automatically. You get notified on match.
          </p>
        </div>
        <WalletConnect />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Category */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="category" className="text-sm font-medium block">
                Category
              </label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="any">Any category</option>
                <option value="electronics">Electronics</option>
                <option value="fashion">Fashion</option>
                <option value="furniture">Furniture</option>
                <option value="other">Other</option>
              </select>
              <p className="text-xs text-muted-foreground">
                "Any category" matches all listings regardless of category.
              </p>
            </div>

            <div className="space-y-1">
              <label htmlFor="tier-ceiling" className="text-sm font-medium block">
                Max Karma tier required
              </label>
              <select
                id="tier-ceiling"
                value={tierCeiling}
                onChange={(e) => {
                  const v = e.target.value;
                  setTierCeiling(v === 'any' ? 'any' : (Number(v) as KarmaTier));
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {TIER_OPTIONS.map((opt) => (
                  <option key={String(opt.value)} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Only match listings whose Karma tier requirement is at or below this ceiling.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Max budget */}
        <Card>
          <CardHeader>
            <CardTitle>Max budget — sealed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="max-budget" className="text-sm font-medium">
                Maximum you'd pay{' '}
                <span className="text-destructive" aria-hidden="true">
                  *
                </span>
              </label>
              <PriceInput
                id="max-budget"
                value={maxBudgetKrw}
                onChange={setMaxBudgetKrw}
                placeholder="e.g. 500,000"
                masked
                label="Maximum budget (KRW)"
              />
              <p className="text-sm text-muted-foreground">
                Sealed with the service's X25519 pubkey before leaving your browser. Decrypted only
                inside <strong>NEAR AI TEE</strong> during matching. Never revealed to sellers or
                stored as plaintext.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Conditions */}
        <Card>
          <CardHeader>
            <CardTitle>Conditions (private)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <label htmlFor="intent-conditions" className="text-sm font-medium block">
              Natural-language conditions
            </label>
            <ConditionInput
              id="intent-conditions"
              value={conditions}
              onChange={setConditions}
              placeholder="e.g. Seoul metro area, weekends preferred, card payment OK"
            />
            <p className="text-xs text-muted-foreground">
              Max 2,048 characters. Sealed before leaving your browser — same privacy guarantees as
              your budget.
            </p>
          </CardContent>
        </Card>

        {/* Expiry */}
        <Card>
          <CardHeader>
            <CardTitle>Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium mb-2">Expires in</legend>
              <div className="flex flex-wrap gap-2">
                {EXPIRE_OPTIONS.map((opt) => (
                  <label
                    key={opt.days}
                    className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors ${
                      expiresInDays === opt.days
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background hover:bg-muted'
                    }`}
                  >
                    <input
                      type="radio"
                      name="expires-in"
                      value={opt.days}
                      checked={expiresInDays === opt.days}
                      onChange={() => setExpiresInDays(opt.days)}
                      className="sr-only"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </CardContent>
        </Card>

        {/* Privacy notice */}
        <div className="rounded-md bg-muted/50 border px-4 py-3 text-xs text-muted-foreground">
          Your budget and conditions are encrypted client-side before transmission. The service
          decrypts them ephemerally inside a <strong>NEAR AI TEE</strong> for matching only — they
          are never logged or stored as plaintext. Sellers only learn that a match was found, not
          your ceiling or conditions.
        </div>

        {/* Bottom bar */}
        <div
          className="sticky bottom-0 bg-background/95 backdrop-blur border-t p-4 flex gap-3"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/intents')}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit} className="flex-1" size="lg">
            {isSubmitting ? 'Creating intent...' : 'Create standing intent'}
          </Button>
        </div>
      </form>
    </div>
  );
}
