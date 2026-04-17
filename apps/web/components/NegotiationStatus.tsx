'use client';

import { AttestationViewer } from '@/components/AttestationViewer';
import { PixelCat } from '@/components/PixelCat';
import { Button } from '@/components/ui/button';
import { formatKRW, formatMeetTime } from '@/lib/format';
import type { GetStatusResponse } from '@bargo/shared';

interface NegotiationStatusProps {
  status: GetStatusResponse;
  onRetry?: () => void;
  onLockEscrow?: (agreedPrice: string) => void;
}

function CatVsCatAnimation() {
  return (
    <div
      className="pixel-box bg-bargo-mint p-6"
      role="status"
      aria-label="Negotiating inside NEAR AI TEE"
    >
      <div className="flex items-center justify-center gap-4 sm:gap-8">
        {/* Seller cat */}
        <div className="flex flex-col items-center gap-2 animate-bounce-left">
          <span className="h-2 w-2 bg-bargo-ink animate-accent-blink-a" aria-hidden="true" />
          <PixelCat
            variant="seller"
            className="w-20 h-20 drop-shadow-[3px_3px_0_#353B51] animate-bot-pulse"
          />
          <span className="pixel-pill">Seller</span>
        </div>

        {/* Exchange dots */}
        <div className="flex gap-1" aria-hidden="true">
          <span className="h-2 w-2 bg-bargo-ink animate-bounce [animation-delay:-0.3s]" />
          <span className="h-2 w-2 bg-bargo-accent animate-bounce [animation-delay:-0.15s]" />
          <span className="h-2 w-2 bg-bargo-ink animate-bounce" />
        </div>

        {/* Buyer cat */}
        <div className="flex flex-col items-center gap-2 animate-bounce-right">
          <span className="h-2 w-2 bg-bargo-ink animate-accent-blink-b" aria-hidden="true" />
          <PixelCat
            variant="buyer"
            className="w-20 h-20 drop-shadow-[3px_3px_0_#353B51] animate-bot-pulse"
          />
          <span className="pixel-pill bg-bargo-soft">Buyer</span>
        </div>
      </div>
    </div>
  );
}

export function NegotiationStatus({ status, onRetry, onLockEscrow }: NegotiationStatusProps) {
  const { state, attestation, onchainTxHash } = status;

  if (state === 'queued' || state === 'running') {
    return (
      <div className="text-center space-y-4">
        <CatVsCatAnimation />
        <p className="font-mono text-sm font-bold uppercase tracking-wider">
          Cats bartering inside TEE...
        </p>
        <p className="text-xs text-bargo-ink/70 max-w-md mx-auto leading-relaxed">
          Price and conditions are processed inside NEAR AI TEE. Counterparty never sees them.
          Operator sees plaintext for ~15s during negotiation; auto-purged on deal completion.
        </p>
      </div>
    );
  }

  if (state === 'fail') {
    return (
      <div className="pixel-box bg-bargo-soft p-6 text-center space-y-4">
        <div className="font-pixel text-2xl" aria-hidden="true">
          X_X
        </div>
        <p className="font-mono font-black uppercase tracking-wider text-sm">
          No deal — the cats walked away
        </p>
        <p className="text-xs text-bargo-ink/70">Conditions clashed. Which ones? Kept private.</p>
        {onRetry && (
          <Button onClick={onRetry} variant="outline" size="sm">
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
      <div className="space-y-4">
        <div className="pixel-box bg-bargo-accent p-4 flex items-center gap-3">
          <span className="font-pixel text-sm" aria-hidden="true">
            \(^o^)/
          </span>
          <p className="font-mono font-black uppercase tracking-wider text-sm">
            Paws shook — deal locked!
          </p>
        </div>

        <div className="pixel-box bg-bargo-white p-5 space-y-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest opacity-60 mb-1">
              Agreed price
            </p>
            <p className="font-mono text-3xl font-black">{formatKRW(agreedPrice)}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t-2 border-bargo-ink">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest opacity-60 mb-0.5">
                Location
              </p>
              <p className="text-sm font-medium">{agreedConditions.location}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest opacity-60 mb-0.5">
                Time
              </p>
              <p className="text-sm font-medium">{formatMeetTime(agreedConditions.meetTimeIso)}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest opacity-60 mb-0.5">
                Payment
              </p>
              <p className="text-sm font-medium">{agreedConditions.payment}</p>
            </div>
          </div>
        </div>

        <AttestationViewer attestation={attestation} onchainTxHash={onchainTxHash} />

        {state === 'agreement' && onLockEscrow && (
          <Button onClick={() => onLockEscrow(agreedPrice)} className="w-full" size="lg">
            Lock escrow
          </Button>
        )}

        {state === 'settled' && (
          <div className="pixel-box bg-bargo-white p-3 flex items-center gap-2">
            <span className="h-2 w-2 bg-bargo-accent" aria-hidden="true" />
            <p className="font-mono text-xs font-bold uppercase tracking-wider">Escrow locked</p>
          </div>
        )}
      </div>
    );
  }

  return null;
}
