'use client';

import * as React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { DealId, Hex } from '@haggle/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
        <p className="text-sm font-medium">내 QR 코드 (상대방이 스캔)</p>
        <div className="rounded-xl border-2 border-primary/30 p-3 bg-white">
          <QRCodeSVG
            value={qrPayload}
            size={200}
            level="M"
            aria-label={`Deal ${dealId} QR code`}
          />
        </div>
        <p className="text-xs text-muted-foreground text-center">
          이 QR을 상대방 화면에 보여주세요
        </p>
      </div>

      {/* Manual payload input (camera scanner fallback for demo) */}
      {onScan && (
        <div className="space-y-2">
          <p className="text-sm font-medium">상대방 QR 스캔</p>
          <p className="text-xs text-muted-foreground">
            데모: 상대방 QR의 내용을 직접 붙여넣기
          </p>
          <div className="flex gap-2">
            <Input
              value={manualPayload}
              onChange={(e) => setManualPayload(e.target.value)}
              placeholder='{"dealId":"0x...","signature":"0x..."}'
              aria-label="상대방 QR 페이로드 입력"
            />
            <Button onClick={handleManualSubmit} disabled={!manualPayload.trim()}>
              확인
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
