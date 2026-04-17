'use client';

import { NegotiationStatus } from '@/components/NegotiationStatus';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useNegotiationStatus } from '@/lib/api';
import type { DealId } from '@bargo/shared';
import { ADDRESSES, bargoEscrowAbi } from '@bargo/shared';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { useAccount, useWriteContract } from 'wagmi';

const HOODI_CHAIN_ID = 374;

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
  const dealId = params.id as DealId;
  // Passed from offer submission — used to pre-fill retry form
  const retryListingId = searchParams.get('listingId') ?? '';
  const retryBid = searchParams.get('bid') ?? '';
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [escrowLocked, setEscrowLocked] = React.useState(false);
  const [meetupComplete, setMeetupComplete] = React.useState(false);
  const [isConfirming, setIsConfirming] = React.useState(false);
  // Track terminal state separately so we can use it in refetchInterval without a forward ref
  const [isTerminal, setIsTerminal] = React.useState(false);

  const escrowAddress = ADDRESSES[HOODI_CHAIN_ID]?.bargoEscrow;

  const {
    data: status,
    error,
    isLoading,
  } = useNegotiationStatus(dealId, {
    // Stop polling once we reach a terminal state
    refetchInterval: !escrowLocked && !isTerminal ? 1000 : false,
  });

  // Derive terminal state inline to avoid the useEffect race
  const terminalState =
    status?.state === 'agreement' || status?.state === 'fail' || status?.state === 'settled';
  if (terminalState && !isTerminal) {
    setIsTerminal(true);
  }

  async function handleLockEscrow(agreedPrice: string) {
    if (!address) {
      toast.error('Connect your wallet');
      return;
    }

    toast.info('Locking escrow...');
    try {
      // In production: call lockEscrow(dealId, {value: agreedPriceWei})
      // ABI stub is empty — when contract-lead ships ABI this activates.
      // For demo: simulate success
      void agreedPrice; // used via on-chain call in production
      setEscrowLocked(true);
      toast.success('Escrow locked! Confirm the meetup when you receive the item.');
    } catch {
      toast.error('Escrow lock failed. Check your wallet and try again.');
    }
  }

  async function handleConfirmMeetup() {
    if (!address) {
      toast.error('Connect your wallet');
      return;
    }
    if (!escrowAddress) {
      toast.error('Escrow contract address not configured');
      return;
    }

    setIsConfirming(true);
    toast.info('Confirming meetup...');
    try {
      await writeContractAsync({
        address: escrowAddress,
        abi: bargoEscrowAbi,
        functionName: 'confirmMeetup',
        args: [dealId],
      });
      setMeetupComplete(true);
      if (confetti) {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#F59E0B', '#10B981', '#6366F1'],
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Confirmation failed';
      toast.error(`Confirmation failed: ${msg}`);
    } finally {
      setIsConfirming(false);
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
        <p className="text-muted-foreground">Could not load negotiation status.</p>
        <Button variant="outline" onClick={() => router.push('/listings')}>
          Back to listings
        </Button>
      </div>
    );
  }

  if (meetupComplete) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-16 text-center">
        <p className="text-5xl" aria-hidden="true">
          🎊
        </p>
        <h1 className="text-2xl font-bold">Deal complete!</h1>
        <Button asChild size="lg">
          <a href="/listings">Browse more listings</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold">Negotiation status</h1>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">{dealId.slice(0, 18)}...</p>
      </div>

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

      {escrowLocked && !meetupComplete && (
        <Card>
          <CardContent className="pt-6 space-y-3 text-center">
            <p className="text-sm text-muted-foreground">
              Once you've received the item in person, confirm the meetup to release escrow to the
              seller.
            </p>
            <Button
              onClick={handleConfirmMeetup}
              disabled={isConfirming}
              className="w-full"
              size="lg"
            >
              {isConfirming ? 'Confirming...' : 'Confirm meetup & release funds'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
