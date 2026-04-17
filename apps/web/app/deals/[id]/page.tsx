'use client';

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAccount, useSignMessage } from 'wagmi';
import { toast } from 'sonner';
import type { DealId, Hex } from '@bargo/shared';
import { useNegotiationStatus } from '@/lib/api';
import { NegotiationStatus } from '@/components/NegotiationStatus';
import { MeetupQR } from '@/components/MeetupQR';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Dynamic import for canvas-confetti (client only, ~3KB)
let confetti: ((opts: object) => void) | null = null;
if (typeof window !== 'undefined') {
  import('canvas-confetti').then((m) => {
    confetti = m.default as (opts: object) => void;
  });
}

export default function DealPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dealId = params['id'] as DealId;
  // Passed from offer submission — used to pre-fill retry form
  const retryListingId = searchParams.get('listingId') ?? '';
  const retryBid = searchParams.get('bid') ?? '';
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [escrowLocked, setEscrowLocked] = React.useState(false);
  const [meetupComplete, setMeetupComplete] = React.useState(false);
  const [myQrSignature, setMyQrSignature] = React.useState<Hex | null>(null);
  // Track terminal state separately so we can use it in refetchInterval without a forward ref
  const [isTerminal, setIsTerminal] = React.useState(false);

  const {
    data: status,
    error,
    isLoading,
  } = useNegotiationStatus(dealId, {
    // Stop polling once we reach a terminal state
    refetchInterval: !escrowLocked && !isTerminal ? 1000 : false,
  });

  // Derive terminal state inline to avoid the useEffect race
  const terminalState = status?.state === 'agreement' || status?.state === 'fail' || status?.state === 'settled';
  if (terminalState && !isTerminal) {
    setIsTerminal(true);
  }

  // Sign meetup QR when escrow is locked
  async function handleSignMeetupQR() {
    if (!address) return;
    try {
      const msg = `Bargo meetup confirm: dealId=${dealId}`;
      const sig = await signMessageAsync({ message: msg });
      setMyQrSignature(sig);
      toast.success('QR 서명 완료. 상대방 QR을 스캔하세요.');
    } catch {
      toast.error('서명 실패');
    }
  }

  async function handleLockEscrow(agreedPrice: string) {
    if (!address) {
      toast.error('지갑을 연결하세요');
      return;
    }

    toast.info('에스크로 락업 중...');
    try {
      // In production: call lockEscrow(dealId, {value: agreedPriceWei})
      // ABI stub is empty — when contract-lead ships ABI this activates.
      // For demo: simulate success
      void agreedPrice; // used via on-chain call in production
      setEscrowLocked(true);
      toast.success('에스크로 락업 완료! 만남 QR을 생성하세요.');
    } catch {
      toast.error('락업에 실패했습니다. 지갑을 확인하고 다시 시도해주세요.');
    }
  }

  function handleOtherQRScanned(payload: string) {
    try {
      const parsed = JSON.parse(payload) as { dealId: string; signature: string };
      if (parsed.dealId === dealId) {
        toast.success('상대방 QR 확인 완료! 거래 완료 처리 중...');
        // In production: submit confirmMeetup tx with both signatures
        setTimeout(() => {
          setMeetupComplete(true);
          if (confetti) {
            confetti({
              particleCount: 150,
              spread: 70,
              origin: { y: 0.6 },
              colors: ['#F59E0B', '#10B981', '#6366F1'],
            });
          }
        }, 800);
      } else {
        toast.error('다른 거래의 QR입니다. 상대방에게 현재 거래 QR을 요청하세요.');
      }
    } catch {
      toast.error('QR 형식이 올바르지 않습니다. 상대방에게 QR을 다시 요청하세요.');
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse py-8">
        <div className="h-6 bg-muted rounded w-1/2 mx-auto" />
        <div className="h-40 bg-muted rounded" />
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-muted-foreground">협상 정보를 불러올 수 없습니다.</p>
        <Button variant="outline" onClick={() => router.push('/listings')}>
          목록으로
        </Button>
      </div>
    );
  }

  // Completed state
  if (meetupComplete) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-16 text-center">
        <p className="text-5xl" aria-hidden="true">🎊</p>
        <div>
          <h1 className="text-2xl font-bold">거래 완료!</h1>
          <p className="text-muted-foreground mt-1">Karma +1 적립</p>
        </div>
        <Button asChild size="lg">
          <a href="/listings">다른 매물 보기</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold">협상 상태</h1>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">
          {dealId.slice(0, 18)}...
        </p>
      </div>

      {/* Main status card */}
      <Card>
        <CardContent className="pt-6">
          <NegotiationStatus
            status={status}
            onRetry={() => {
              const dest = retryListingId
                ? `/offers/new/${retryListingId}${retryBid ? `?bid=${retryBid}` : ''}`
                : '/listings';
              router.push(dest);
            }}
            onLockEscrow={handleLockEscrow}
          />
        </CardContent>
      </Card>

      {/* Escrow locked: show meetup QR flow */}
      {escrowLocked && !meetupComplete && (
        <Card>
          <CardHeader>
            <CardTitle>만남 인증</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!myQrSignature ? (
              <div className="text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  만남 인증 QR을 생성하세요. 서로의 QR을 스캔해야 에스크로가 정산됩니다.
                </p>
                <Button onClick={handleSignMeetupQR} className="w-full">
                  만남 QR 생성하기
                </Button>
              </div>
            ) : (
              <MeetupQR
                dealId={dealId}
                signature={myQrSignature}
                onScan={handleOtherQRScanned}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* No-show report */}
      {escrowLocked && !meetupComplete && (
        <div className="rounded-md border border-destructive/30 p-4 space-y-2">
          <p className="text-sm font-medium text-destructive">노쇼 신고</p>
          <p className="text-xs text-muted-foreground">
            24시간 내 만남 인증이 없으면 노쇼로 신고할 수 있습니다.
            신고 시 상대방 Karma가 하락하고 에스크로가 환불됩니다.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => toast.info('노쇼 신고는 락업 후 24시간 이후 가능합니다')}
          >
            노쇼 신고
          </Button>
        </div>
      )}
    </div>
  );
}
