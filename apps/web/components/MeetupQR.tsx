'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DealId, Hex } from '@bargo/shared';
import { QRCodeSVG } from 'qrcode.react';
import * as React from 'react';

interface MeetupQRProps {
  dealId: DealId;
  signature: Hex;
  onScan?: (payload: string) => void;
}

export function MeetupQR({ dealId, signature, onScan }: MeetupQRProps) {
  const [manualPayload, setManualPayload] = React.useState('');

  const qrPayload = JSON.stringify({ dealId, signature });

  function handleManualSubmit() {
    if (manualPayload.trim() && onScan) {
      onScan(manualPayload.trim());
    }
  }

  return (
    <div className="space-y-6">
      {/* My QR code */}
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm font-medium">My QR code (counterparty scans this)</p>
        <div className="rounded-xl border-2 border-primary/30 p-3 bg-white">
          <QRCodeSVG value={qrPayload} size={200} level="M" aria-label={`Deal ${dealId} QR code`} />
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Show this QR to your counterparty
        </p>
      </div>

      {/* Manual payload input (camera scanner fallback for demo) */}
      {onScan && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Scan counterparty QR</p>
          <p className="text-xs text-muted-foreground">
            Demo: paste the counterparty's QR payload directly
          </p>
          <div className="flex gap-2">
            <Input
              value={manualPayload}
              onChange={(e) => setManualPayload(e.target.value)}
              placeholder='{"dealId":"0x...","signature":"0x..."}'
              aria-label="Counterparty QR payload"
            />
            <Button onClick={handleManualSubmit} disabled={!manualPayload.trim()}>
              Confirm
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
