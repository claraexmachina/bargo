'use client';

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAccount } from 'wagmi';
import { toast } from 'sonner';
import type { ListingId } from '@haggle/shared';
import { WalletConnect } from '@/components/WalletConnect';
import { UserKarma } from '@/components/UserKarma';
import { ConditionInput } from '@/components/ConditionInput';
import { PriceInput } from '@/components/PriceInput';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useListing, usePostOffer } from '@/lib/api';
import { buildRLNProof } from '@/lib/rln';
import { krwToWei, formatKRW } from '@/lib/format';

export default function NewOfferPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const listingId = params['listingId'] as ListingId;
  const { address, isConnected } = useAccount();

  const { data: listing } = useListing(listingId);
  const postOffer = usePostOffer();

  // Pre-fill bid from query param when retrying after a failed negotiation
  const initialBid = searchParams.get('bid') ?? '';
  const [bidPriceKrw, setBidPriceKrw] = React.useState(initialBid);
  const [maxPriceKrw, setMaxPriceKrw] = React.useState('');
  const [conditions, setConditions] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const canSubmit =
    isConnected &&
    !!address &&
    bidPriceKrw.length > 0 &&
    maxPriceKrw.length > 0 &&
    !isSubmitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !address) return;

    setIsSubmitting(true);

    // Capture sensitive values to locals and clear state BEFORE POST.
    // This prevents plaintext lingering in React state on error.
    const rawMax = maxPriceKrw;
    const rawCond = conditions;
    setMaxPriceKrw('');
    setConditions('');

    try {
      const bidPriceWei = krwToWei(bidPriceKrw);
      const bidPriceBigInt = BigInt(bidPriceWei);
      const maxPriceWei = krwToWei(rawMax);

      // Build RLN proof (unchanged from V1)
      const rlnProof = buildRLNProof({
        listingId,
        bidPriceWei: bidPriceBigInt,
        walletAddress: address,
      });

      const result = await postOffer.mutateAsync({
        buyer: address,
        listingId,
        bidPrice: bidPriceWei,
        plaintextMaxBuy: maxPriceWei,
        plaintextBuyerConditions: rawCond.trim().slice(0, 2048),
        rlnProof,
      });

      toast.success('오퍼가 제출되었습니다! 협상을 시작합니다...');
      router.push(`/deals/${result.negotiationId}?listingId=${listingId}&bid=${bidPriceKrw}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (process.env.NODE_ENV === 'development') {
        console.error('[offers/new] submit error:', err);
      }
      if (msg.includes('karma') || msg.includes('403')) {
        toast.error('Karma 티어가 부족합니다. 이 매물에 오퍼할 수 없습니다.');
      } else if (msg.includes('rln') || msg.includes('nullifier')) {
        toast.error('RLN 검증 실패 — 이 매물에 너무 많은 오퍼를 제출했습니다.');
      } else {
        toast.error('오퍼 제출에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
        <p className="text-xl font-semibold">지갑을 연결해야 오퍼를 제출할 수 있습니다</p>
        <WalletConnect />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">오퍼 제출</h1>
          {listing && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {listing.itemMeta.title} — 희망가 {formatKRW(listing.askPrice)}
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

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Bid price */}
        <Card>
          <CardHeader>
            <CardTitle>제안 가격</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="bid-price" className="text-sm font-medium">
                제안가 (공개) <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <PriceInput
                id="bid-price"
                value={bidPriceKrw}
                onChange={setBidPriceKrw}
                placeholder="720,000"
                label="제안 가격 (원)"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="max-price" className="text-sm font-medium">
                최대가 — 마지노선 (비공개) <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <PriceInput
                id="max-price"
                value={maxPriceKrw}
                onChange={setMaxPriceKrw}
                placeholder="750,000"
                masked
                label="최대 구매가 (원)"
              />
              <p className="text-sm text-muted-foreground">
                이 가격은 <strong>NEAR AI TEE 안에서만 LLM에 전달</strong>됩니다.
                상대방은 볼 수 없고, 서비스는 거래 완료 후 자동 삭제합니다.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Conditions */}
        <Card>
          <CardHeader>
            <CardTitle>거래 조건 (비공개)</CardTitle>
          </CardHeader>
          <CardContent>
            <label htmlFor="buyer-conditions" className="text-sm font-medium block mb-2">
              자연어 조건 입력
            </label>
            <ConditionInput
              id="buyer-conditions"
              value={conditions}
              onChange={setConditions}
              placeholder="예: 강남 가능, 토요일만, 카드결제 가능"
            />
          </CardContent>
        </Card>

        {/* RLN notice */}
        <div className="rounded-md bg-muted/50 border px-4 py-3 text-xs text-muted-foreground">
          RLN (Rate Limiting Nullifier) proof가 자동으로 첨부됩니다.
          동일 매물에 5분 내 3회 초과 오퍼 시 거부됩니다 (스팸 방지).
        </div>

        {/* Bottom bar */}
        <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t p-4 flex gap-3" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">
            취소
          </Button>
          <Button type="submit" disabled={!canSubmit} className="flex-1" size="lg">
            {isSubmitting ? '제출 중...' : '오퍼 제출'}
          </Button>
        </div>
      </form>
    </div>
  );
}
