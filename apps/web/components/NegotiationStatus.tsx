'use client';

import { AttestationViewer } from '@/components/AttestationViewer';
import { Button } from '@/components/ui/button';
import { formatKRW, formatMeetTime } from '@/lib/format';
import type { GetStatusResponse } from '@bargo/shared';

interface NegotiationStatusProps {
  status: GetStatusResponse;
  onRetry?: () => void;
  onLockEscrow?: (agreedPrice: string) => void;
}

function BotVsBotAnimation() {
  return (
    <div
      className="flex items-center justify-center gap-4 py-6"
      role="status"
      aria-label="Negotiating inside NEAR AI TEE"
    >
      {/* Seller bot bubble */}
      <div className="flex flex-col items-center gap-2 animate-bounce-left">
        <span
          className="h-2 w-2 rounded-full bg-blue-500 animate-accent-blink-a mb-1"
          aria-hidden="true"
        />
        <div className="text-3xl animate-bot-pulse" aria-hidden="true">
          🤖
        </div>
        <div className="rounded-xl bg-blue-100 dark:bg-blue-900/30 px-3 py-1.5 text-xs text-blue-700 dark:text-blue-300 max-w-[80px] text-center">
          Seller bot
        </div>
      </div>

      {/* Exchange dots */}
      <div className="flex gap-1" aria-hidden="true">
        <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
        <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
        <span className="h-2 w-2 rounded-full bg-primary animate-bounce" />
      </div>

      {/* Buyer bot bubble */}
      <div className="flex flex-col items-center gap-2 animate-bounce-right">
        <span
          className="h-2 w-2 rounded-full bg-purple-500 animate-accent-blink-b mb-1"
          aria-hidden="true"
        />
        <div className="text-3xl animate-bot-pulse" aria-hidden="true">
          🤖
        </div>
        <div className="rounded-xl bg-purple-100 dark:bg-purple-900/30 px-3 py-1.5 text-xs text-purple-700 dark:text-purple-300 max-w-[80px] text-center">
          Buyer bot
        </div>
      </div>
    </div>
  );
}

export function NegotiationStatus({ status, onRetry, onLockEscrow }: NegotiationStatusProps) {
  const { state, attestation, onchainTxHash } = status;

  if (state === 'queued' || state === 'running') {
    return (
      <div className="text-center space-y-3">
        <BotVsBotAnimation />
        <p className="text-sm font-medium">Negotiating inside NEAR AI TEE...</p>
        <p className="text-xs text-muted-foreground">
          Price and conditions are processed inside NEAR AI TEE. Counterparty never sees them.
          Operator sees plaintext for ~15s during negotiation; auto-purged on deal completion.
        </p>
      </div>
    );
  }

  if (state === 'fail') {
    return (
      <div className="text-center space-y-4 py-4">
        <div className="text-4xl" aria-hidden="true">
          ❌
        </div>
        <p className="text-lg font-semibold text-destructive">
          Negotiation failed — adjust your conditions and try again
        </p>
        <p className="text-sm text-muted-foreground">
          Which conditions conflicted is not disclosed.
        </p>
        {onRetry && (
          <Button onClick={onRetry} variant="outline" className="mt-2">
            Try again
          </Button>
        )}
      </div>
    );
  }

  if (state === 'agreement' || state === 'settled') {
    if (!attestation) return null;

    const { agreedPrice, agreedConditions } = attestation;

    return (
      <div className="space-y-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">
            🎉
          </span>
          <p className="text-lg font-semibold text-green-600 dark:text-green-400">
            Agreement reached!
          </p>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
              Agreed price
            </p>
            <p className="text-2xl font-bold">{formatKRW(agreedPrice)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
              Meetup location
            </p>
            <p className="font-medium">{agreedConditions.location}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
              Meetup time
            </p>
            <p className="font-medium">{formatMeetTime(agreedConditions.meetTimeIso)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
              Payment method
            </p>
            <p className="font-medium">{agreedConditions.payment}</p>
          </div>
        </div>

        <AttestationViewer attestation={attestation} onchainTxHash={onchainTxHash} />

        {state === 'agreement' && onLockEscrow && (
          <Button onClick={() => onLockEscrow(agreedPrice)} className="w-full" size="lg">
            Lock escrow
          </Button>
        )}

        {state === 'settled' && (
          <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3">
            <p className="text-sm text-green-700 dark:text-green-300 font-medium">Escrow locked</p>
          </div>
        )}
      </div>
    );
  }

  return null;
}
