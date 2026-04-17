'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { toast } from 'sonner';
import { WalletConnect } from '@/components/WalletConnect';
import { ConditionInput } from '@/components/ConditionInput';
import { PriceInput } from '@/components/PriceInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePostListing } from '@/lib/api';
import { krwToWei } from '@/lib/format';
import type { KarmaTier } from '@haggle/shared';

const CATEGORIES = [
  { value: 'electronics', label: '전자기기' },
  { value: 'fashion', label: '패션/의류' },
  { value: 'furniture', label: '가구/인테리어' },
  { value: 'other', label: '기타' },
] as const;

const KARMA_TIERS: { value: KarmaTier; label: string }[] = [
  { value: 0, label: 'Tier 0 — 누구나' },
  { value: 1, label: 'Tier 1 — Regular 이상' },
  { value: 2, label: 'Tier 2 — Trusted 이상' },
  { value: 3, label: 'Tier 3 — Elite만' },
];

export default function NewListingPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const postListing = usePostListing();

  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [category, setCategory] = React.useState<typeof CATEGORIES[number]['value']>('electronics');
  const [askPriceKrw, setAskPriceKrw] = React.useState('');
  const [minPriceKrw, setMinPriceKrw] = React.useState('');
  const [conditions, setConditions] = React.useState('');
  const [requiredTier, setRequiredTier] = React.useState<KarmaTier>(0);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const canSubmit =
    isConnected &&
    !!address &&
    title.trim().length > 0 &&
    askPriceKrw.length > 0 &&
    minPriceKrw.length > 0 &&
    !isSubmitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !address) return;

    setIsSubmitting(true);

    // Capture sensitive values to locals and clear state BEFORE POST.
    // This prevents plaintext lingering in React state on error.
    const rawMin = minPriceKrw;
    const rawCond = conditions;
    setMinPriceKrw('');
    setConditions('');

    try {
      const askPriceWei = krwToWei(askPriceKrw);
      const minPriceWei = krwToWei(rawMin);

      const itemMeta = {
        title: title.trim(),
        description: description.trim(),
        category,
        images: [] as string[],
      };

      const result = await postListing.mutateAsync({
        seller: address,
        askPrice: askPriceWei,
        requiredKarmaTier: requiredTier,
        itemMeta,
        plaintextMinSell: minPriceWei,
        plaintextSellerConditions: rawCond.trim().slice(0, 2048),
      });

      toast.success('매물이 등록되었습니다!');

      if (result.onchainTxHash && result.onchainTxHash !== '0x') {
        toast.success('온체인 등록 완료');
      }

      router.push(`/listings/${result.listingId}`);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[listings/new] submit error:', err);
      }
      toast.error('매물 등록에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
        <p className="text-xl font-semibold">지갑을 연결해야 매물을 등록할 수 있습니다</p>
        <WalletConnect />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">매물 등록</h1>
        <WalletConnect />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <Card>
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="title" className="text-sm font-medium">
                제목 <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="맥북 M1 Pro 14인치"
                maxLength={200}
                required
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="description" className="text-sm font-medium">
                설명
              </label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="상태, 구성품, 기타 사항"
                maxLength={2000}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="category" className="text-sm font-medium">
                카테고리
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
            <CardTitle>가격 설정</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="ask-price" className="text-sm font-medium">
                희망가 (공개) <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <PriceInput
                id="ask-price"
                value={askPriceKrw}
                onChange={setAskPriceKrw}
                placeholder="800,000"
                label="희망 판매가 (원)"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="min-price" className="text-sm font-medium">
                최저가 — 마지노선 (비공개) <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <PriceInput
                id="min-price"
                value={minPriceKrw}
                onChange={setMinPriceKrw}
                placeholder="700,000"
                masked
                label="최저 판매가 (원)"
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
            <label htmlFor="conditions" className="text-sm font-medium block mb-2">
              자연어 조건 입력
            </label>
            <ConditionInput
              id="conditions"
              value={conditions}
              onChange={setConditions}
              placeholder="예: 강남/송파 직거래만, 평일 19시 이후, 박스 없음"
            />
          </CardContent>
        </Card>

        {/* Karma gating */}
        <Card>
          <CardHeader>
            <CardTitle>Karma 요구 티어</CardTitle>
          </CardHeader>
          <CardContent>
            <label htmlFor="karma-tier" className="text-sm font-medium block mb-2">
              최소 Karma 티어
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
              고가 매물(50만원+)은 스마트 컨트랙트에서 Tier 2 이상만 오퍼 가능하도록 자동 제한됩니다.
            </p>
          </CardContent>
        </Card>

        {/* Submit — bottom of screen, thumb-reachable */}
        <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t p-4 flex gap-3" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            className="flex-1"
          >
            취소
          </Button>
          <Button type="submit" disabled={!canSubmit} className="flex-1" size="lg">
            {isSubmitting ? '등록 중...' : '매물 등록'}
          </Button>
        </div>
      </form>
    </div>
  );
}
