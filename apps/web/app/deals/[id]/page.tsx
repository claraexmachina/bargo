'use client';

import { MeetupQR } from '@/components/MeetupQR';
import { NegotiationStatus } from '@/components/NegotiationStatus';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNegotiationStatus } from '@/lib/api';
import type { DealId, Hex } from '@bargo/shared';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { useAccount, useSignMessage } from 'wagmi';

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
  const terminalState =
    status?.state === 'agreement' || status?.state === 'fail' || status?.state === 'settled';
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
      toast.success("QR signed. Scan the counterparty's QR code.");
    } catch {
      toast.error('Signing failed');
    }
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
      toast.success('Escrow locked! Generate your meetup QR code.');
    } catch {
      toast.error('Escrow lock failed. Check your wallet and try again.');
    }
  }

  function handleOtherQRScanned(payload: string) {
    try {
      const parsed = JSON.parse(payload) as { dealId: string; signature: string };
      if (parsed.dealId === dealId) {
        toast.success('Counterparty QR verified! Finalizing deal...');
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
        toast.error('QR belongs to a different deal. Ask your counterparty for the correct QR.');
      }
    } catch {
      toast.error('Invalid QR format. Ask your counterparty to regenerate their QR.');
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

  // Completed state
  if (meetupComplete) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-16 text-center">
        <p className="text-5xl" aria-hidden="true">
          🎊
        </p>
        <div>
          <h1 className="text-2xl font-bold">Deal complete!</h1>
          <p className="text-muted-foreground mt-1">Karma +1 earned</p>
        </div>
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
            <CardTitle>Meetup verification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!myQrSignature ? (
              <div className="text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  Generate your meetup QR code. Both parties must scan each other's QR to settle the
                  escrow.
                </p>
                <Button onClick={handleSignMeetupQR} className="w-full">
                  Generate meetup QR
                </Button>
              </div>
            ) : (
              <MeetupQR dealId={dealId} signature={myQrSignature} onScan={handleOtherQRScanned} />
            )}
          </CardContent>
        </Card>
      )}

      {/* No-show report */}
      {escrowLocked && !meetupComplete && (
        <div className="rounded-md border border-destructive/30 p-4 space-y-2">
          <p className="text-sm font-medium text-destructive">No-show report</p>
          <p className="text-xs text-muted-foreground">
            If meetup verification is not completed within 24 hours, you can file a no-show report.
            This will reduce the counterparty's Karma and refund the escrow.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => toast.info('No-show reporting is available 24 hours after escrow lock')}
          >
            Report no-show
          </Button>
        </div>
      )}
    </div>
  );
}
