'use client';

import { useAttestationBundle } from '@/lib/api';
import type { DealId, NearAiAttestation } from '@bargo/shared';
import * as React from 'react';
import { toast } from 'sonner';

interface AttestationViewerProps {
  attestation: NearAiAttestation | undefined;
  onchainTxHash?: string | undefined;
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
        navigator.clipboard
          .writeText(value)
          .then(() => {
            toast.success('Copied');
          })
          .catch(() => {
            toast.error('Copy failed');
          });
      }}
      className="ml-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      aria-label={label}
    >
      Copy
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
        {open ? 'Hide full bundle' : 'View full attestation bundle'}
      </button>
      {open && (
        <div className="mt-2 rounded-md border bg-muted/30 p-3 overflow-auto max-h-64">
          {isLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
          {error && <p className="text-xs text-destructive">Could not load bundle.</p>}
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

export function AttestationViewer({ attestation, onchainTxHash }: AttestationViewerProps) {
  if (!attestation) return null;

  const { dealId, modelId, completionId, nearAiAttestationHash } = attestation;

  const hoodiUrl = onchainTxHash
    ? `https://hoodiscan.status.network/tx/${onchainTxHash}`
    : `https://hoodiscan.status.network/search?q=${nearAiAttestationHash}`;

  function handleCopyVerifyScript() {
    const cmd = `node scripts/verify-attestation.mjs --dealId ${dealId}`;
    navigator.clipboard
      .writeText(cmd)
      .then(() => {
        toast.success('Copied');
      })
      .catch(() => {
        toast.error('Copy failed');
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
          <span className="text-muted-foreground shrink-0">Model</span>
          <span className="font-mono text-xs break-all">{modelId}</span>
        </div>

        <div className="flex items-start justify-between gap-2">
          <span className="text-muted-foreground shrink-0">Completion ID</span>
          <span className="font-mono text-xs break-all">
            {truncateHex(completionId, 6)}
            <CopyButton value={completionId} label="Copy completion ID" />
          </span>
        </div>

        <div className="flex items-start justify-between gap-2">
          <span className="text-muted-foreground shrink-0">Attestation hash</span>
          <span className="font-mono text-xs break-all">
            {truncateHex(nearAiAttestationHash)}
            <CopyButton value={nearAiAttestationHash} label="Copy attestation hash" />{' '}
            <a
              href={hoodiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Explorer
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
          Copy judge verification script
        </button>
        <a
          href="https://github.com/claraexmachina/bargo#attestation-verification"
          target="_blank"
          rel="noopener noreferrer"
          className="text-center text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          GitHub verification guide
        </a>
      </div>

      {/* Explainer */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        This deal was processed inside NEAR AI's Intel TDX + NVIDIA GPU TEE. The hash above is
        recorded on the Hoodi contract and can be independently verified by anyone using the
        verification script.
      </p>
    </div>
  );
}
