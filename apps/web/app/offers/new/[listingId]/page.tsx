'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { toast } from 'sonner';
import type { DealId, ListingId } from '@haggle/shared';
import { WalletConnect } from '@/components/WalletConnect';
import { ConditionInput } from '@/components/ConditionInput';
import { PriceInput } from '@/components/PriceInput';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useListing, usePostOffer, useTeePubkey } from '@/lib/api';
import { sealPrice, sealConditions } from '@/lib/encrypt';
import { buildRLNProof } from '@/lib/rln';
import { krwToWei, formatKRW } from '@/lib/format';

export default function NewOfferPage() {
  const params = useParams();
  const router = useRouter();
  const listingId = params['listingId'] as ListingId;
  const { address, isConnected } = useAccount();

  const { data: listing } = useListing(listingId);
  const { data: teePubkeyData } = useTeePubkey();
  const postOffer = usePostOffer();

  const [bidPriceKrw, setBidPriceKrw] = React.useState('');
  const [maxPriceKrw, setMaxPriceKrw] = React.useState(''); // reservation — never sent plain
  const [conditions, setConditions] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const canSubmit =
    isConnected &&
    !!address &&
    !!teePubkeyData &&
    bidPriceKrw.length > 0 &&
    maxPriceKrw.length > 0 &&
    !isSubmitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !address || !teePubkeyData) return;

    setIsSubmitting(true);
    try {
      const bidPriceWei = krwToWei(bidPriceKrw);
      const maxPriceWei = krwToWei(maxPriceKrw);
      const bidPriceBigInt = BigInt(bidPriceWei);

      // Step 1: Seal max price + conditions
      const encMaxBuy = sealPrice(teePubkeyData.pubkey, maxPriceWei, listingId);
      const encBuyerConditions = sealConditions(teePubkeyData.pubkey, conditions, listingId);

      // Clear sensitive state immediately
      setMaxPriceKrw('');
      setConditions('');

      // Step 2: Build RLN proof (stub)
      const rlnProof = buildRLNProof({
        listingId,
        bidPriceWei: bidPriceBigInt,
        walletAddress: address,
      });

      // Step 3: POST /offer
      const result = await postOffer.mutateAsync({
        buyer: address,
        listingId,
        bidPrice: bidPriceWei,
        encMaxBuy,
        encBuyerConditions,
        rlnProof,
      });

      toast.success('오퍼가 제출되었습니다! 협상을 시작합니다...');
      router.push(`/deals/${result.negotiationId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류';
      if (msg.includes('karma') || msg.includes('403')) {
        toast.error('Karma 티어가 부족합니다. 이 매물에 오퍼할 수 없습니다.');
      } else if (msg.includes('rln') || msg.includes('nullifier')) {
        toast.error('RLN 검증 실패 — 이 매물에 너무 많은 오퍼를 제출했습니다.');
      } else {
        toast.error(`오퍼 실패: ${msg}`);
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
          <h1 className="text-2xl font-bold">오퍼 제출 (Make Offer)</h1>
          {listing && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {listing.itemMeta.title} — 희망가 {formatKRW(listing.askPrice)}
            </p>
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
                label="최대 구매가 — 암호화되어 TEE에만 전달 (원)"
              />
              <p className="text-xs text-muted-foreground">
                이 가격은 <strong>암호화되어 TEE로만 전송</strong>됩니다. 판매자·운영자도 알 수 없습니다.
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
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t p-4 flex gap-3 max-w-screen-md mx-auto">
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
