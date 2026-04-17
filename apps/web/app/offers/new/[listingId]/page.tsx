'use client';

import { ConditionInput } from '@/components/ConditionInput';
import { PriceInput } from '@/components/PriceInput';
import { UserKarma } from '@/components/UserKarma';
import { WalletConnect } from '@/components/WalletConnect';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useListing, usePostOffer } from '@/lib/api';
import { formatKRW, krwToWei } from '@/lib/format';
import { lineaEstimateGas } from '@/lib/linea-estimate';
import { buildRLNProof } from '@/lib/rln';
import type { Hex, ListingId } from '@bargo/shared';
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

  const { data: listing } = useListing(listingId);
  const postOffer = usePostOffer();

  // Pre-fill bid from query param when retrying after a failed negotiation
  const initialBid = searchParams.get('bid') ?? '';
  const [bidPriceKrw, setBidPriceKrw] = React.useState(initialBid);
  const [maxPriceKrw, setMaxPriceKrw] = React.useState('');
  const [conditions, setConditions] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitStep, setSubmitStep] = React.useState<'idle' | 'onchain' | 'service'>('idle');

  const escrowAddress = ADDRESSES[HOODI_CHAIN_ID]?.bargoEscrow;

  const canSubmit =
    isConnected && !!address && bidPriceKrw.length > 0 && maxPriceKrw.length > 0 && !isSubmitting;

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
      const bidPriceWei = krwToWei(bidPriceKrw);
      const bidPriceBigInt = BigInt(bidPriceWei);
      const maxPriceWei = krwToWei(rawMax);

      // Build RLN proof (unchanged from V1)
      const rlnProof = buildRLNProof({
        listingId,
        bidPriceWei: bidPriceBigInt,
        walletAddress: address,
      });

      if (!escrowAddress) {
        throw new Error('컨트랙트 주소가 설정되지 않았습니다. docs/deployments.md를 확인하세요.');
      }

      // Step 1: On-chain submitOffer with Status Network gasless-ready gas fields.
      toast.info('지갑에서 트랜잭션을 승인하세요...');
      const rlnProofBytes = rlnProof.proof as Hex;
      const callArgs = [listingId, bidPriceBigInt, rlnProofBytes] as const;
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

      toast.info('트랜잭션 확인 중...');

      // Step 2: Wait for receipt + parse OfferSubmitted event
      const receipt = await publicClient?.waitForTransactionReceipt({ hash: txHash });

      const logs = parseEventLogs({
        abi: bargoEscrowAbi,
        eventName: 'OfferSubmitted',
        logs: receipt.logs,
      });

      const firstLog = logs[0];
      if (!firstLog) {
        throw new Error('OfferSubmitted 이벤트를 찾을 수 없습니다. 트랜잭션을 확인해주세요.');
      }

      const offerId = (firstLog.args as { offerId: Hex }).offerId;
      toast.success('온체인 오퍼 등록 완료!');

      // Step 3: POST to negotiation service
      setSubmitStep('service');
      const result = await postOffer.mutateAsync({
        offerId,
        buyer: address,
        listingId,
        bidPrice: bidPriceWei,
        plaintextMaxBuy: maxPriceWei,
        plaintextBuyerConditions: rawCond.trim().slice(0, 2048),
        rlnProof,
        onchainTxHash: txHash,
      });

      toast.success('오퍼가 제출되었습니다! 협상을 시작합니다...');
      router.push(`/deals/${result.negotiationId}?listingId=${listingId}&bid=${bidPriceKrw}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (process.env.NODE_ENV === 'development') {
        console.error('[offers/new] submit error:', err);
      }
      if (msg.includes('User rejected') || msg.includes('user rejected')) {
        toast.error('트랜잭션이 취소되었습니다.');
      } else if (msg.includes('컨트랙트 주소')) {
        toast.error(msg);
      } else if (msg.includes('karma') || msg.includes('403') || msg.includes('KarmaTier')) {
        toast.error('Karma 티어가 부족합니다. 이 매물에 오퍼할 수 없습니다.');
      } else if (msg.includes('rln') || msg.includes('nullifier') || msg.includes('RLN')) {
        toast.error('RLN 검증 실패 — 이 매물에 너무 많은 오퍼를 제출했습니다.');
      } else {
        toast.error('오퍼 제출에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
    } finally {
      setIsSubmitting(false);
      setSubmitStep('idle');
    }
  }

  function submitLabel() {
    if (!isSubmitting) return '오퍼 제출';
    if (submitStep === 'onchain') return '온체인 등록 중...';
    if (submitStep === 'service') return '서비스 등록 중...';
    return '제출 중...';
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

      {chainId !== HOODI_CHAIN_ID && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Hoodi 네트워크 (chainId {HOODI_CHAIN_ID})로 전환해주세요.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Bid price */}
        <Card>
          <CardHeader>
            <CardTitle>제안 가격</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="bid-price" className="text-sm font-medium">
                제안가 (공개){' '}
                <span className="text-destructive" aria-hidden="true">
                  *
                </span>
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
                최대가 — 마지노선 (비공개){' '}
                <span className="text-destructive" aria-hidden="true">
                  *
                </span>
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
                이 가격은 <strong>NEAR AI TEE 안에서 LLM이 처리</strong>합니다. 상대방은 절대 볼 수
                없고, 운영자는 합의 중 ~15초간만 보며 거래 완료 즉시 자동 삭제합니다.
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
          RLN (Rate Limiting Nullifier) proof가 자동으로 첨부됩니다. 동일 매물에 5분 내 3회 초과
          오퍼 시 거부됩니다 (스팸 방지).
        </div>

        {/* Bottom bar */}
        <div
          className="sticky bottom-0 bg-background/95 backdrop-blur border-t p-4 flex gap-3"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">
            취소
          </Button>
          <Button type="submit" disabled={!canSubmit} className="flex-1" size="lg">
            {submitLabel()}
          </Button>
        </div>
      </form>
    </div>
  );
}
