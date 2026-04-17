'use client';

import * as React from 'react';
import { toast } from 'sonner';
import type { NearAiAttestation, DealId } from '@haggle/shared';
import { useAttestationBundle } from '@/lib/api';

interface AttestationViewerProps {
  attestation: NearAiAttestation | undefined;
}

function truncateHex(hex: string, chars = 8): string {
  if (hex.length <= chars * 2 + 2) return hex;
  return `${hex.slice(0, chars + 2)}...${hex.slice(-chars)}`;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          toast.success('복사 완료');
        }).catch(() => {
          toast.error('복사 실패');
        });
      }}
      className="ml-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      aria-label={label}
    >
      복사
    </button>
  );
}

function AttestationBundleExpando({ dealId }: { dealId: DealId }) {
  const [open, setOpen] = React.useState(false);
  const { data, isLoading, error } = useAttestationBundle(open ? dealId : null);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-primary underline underline-offset-2"
        aria-expanded={open}
      >
        {open ? '전체 번들 닫기' : '전체 증명 번들 보기'}
      </button>
      {open && (
        <div className="mt-2 rounded-md border bg-muted/30 p-3 overflow-auto max-h-64">
          {isLoading && <p className="text-xs text-muted-foreground">불러오는 중...</p>}
          {error && <p className="text-xs text-destructive">번들을 불러올 수 없습니다.</p>}
          {data && (
            <pre className="text-xs whitespace-pre-wrap break-all">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function AttestationViewer({ attestation }: AttestationViewerProps) {
  if (!attestation) return null;

  const { dealId, modelId, completionId, nearAiAttestationHash } = attestation;

  const hoodiUrl = `https://explorer.hoodi.network/search?q=${nearAiAttestationHash}`;

  function handleCopyVerifyScript() {
    const cmd = `node scripts/verify-attestation.mjs --dealId ${dealId}`;
    navigator.clipboard.writeText(cmd).then(() => {
      toast.success('복사 완료');
    }).catch(() => {
      toast.error('복사 실패');
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span aria-hidden="true">🛡️</span>
          <h3 className="text-sm font-semibold">NEAR AI TEE Attestation</h3>
        </div>
        <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full font-medium">
          verifiable
        </span>
      </div>

      {/* Fields */}
      <div className="space-y-2 text-sm">
        <div className="flex items-start justify-between gap-2">
          <span className="text-muted-foreground shrink-0">모델</span>
          <span className="font-mono text-xs break-all">{modelId}</span>
        </div>

        <div className="flex items-start justify-between gap-2">
          <span className="text-muted-foreground shrink-0">완료 ID</span>
          <span className="font-mono text-xs break-all">
            {truncateHex(completionId, 6)}
            <CopyButton value={completionId} label="완료 ID 복사" />
          </span>
        </div>

        <div className="flex items-start justify-between gap-2">
          <span className="text-muted-foreground shrink-0">증명 해시</span>
          <span className="font-mono text-xs break-all">
            {truncateHex(nearAiAttestationHash)}
            <CopyButton value={nearAiAttestationHash} label="증명 해시 복사" />
            {' '}
            <a
              href={hoodiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              익스플로러
            </a>
          </span>
        </div>
      </div>

      {/* Bundle expando */}
      <AttestationBundleExpando dealId={dealId} />

      {/* Verify CTA */}
      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={handleCopyVerifyScript}
          className="w-full rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          심사위원용 검증 스크립트 복사
        </button>
        <a
          href="https://github.com/haggle-app/haggle#attestation-verification"
          target="_blank"
          rel="noopener noreferrer"
          className="text-center text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          GitHub 검증 가이드
        </a>
      </div>

      {/* Explainer */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        이 거래는 NEAR AI의 Intel TDX + NVIDIA GPU TEE 안에서 처리되었습니다.
        위 해시는 Hoodi 컨트랙트에 기록되어 있으며, 검증 스크립트로 누구나 TEE 무결성을 재확인할 수 있습니다.
      </p>
    </div>
  );
}
