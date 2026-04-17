'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAckIntentMatch, useIntentMatches } from '@/lib/api';
import { useMounted } from '@/lib/use-mounted';
import type { IntentMatch, ListingId } from '@bargo/shared';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useAccount } from 'wagmi';

export function IntentMatchBanner() {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const { data } = useIntentMatches(isConnected ? address : undefined);
  const ackMatch = useAckIntentMatch();
  const [open, setOpen] = React.useState(false);

  const matches = data?.matches ?? [];
  const unacknowledged = matches.filter((m) => !m.acknowledged);

  if (!mounted || !isConnected || unacknowledged.length === 0) return null;

  function handleReview(match: IntentMatch) {
    void ackMatch.mutateAsync({
      intentId: match.intentId,
      listingId: match.listingId as ListingId,
    });
    setOpen(false);
    router.push(`/offers/new/${match.listingId}?fromIntent=${match.intentId}`);
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`${unacknowledged.length} intent match${unacknowledged.length !== 1 ? 'es' : ''}`}
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-10 h-10 border-2 border-bargo-ink bg-bargo-white hover:bg-bargo-accent transition-colors"
      >
        {/* Bell icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <Badge
          className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center p-0 text-[10px]"
          aria-hidden="true"
        >
          {unacknowledged.length > 9 ? '9+' : unacknowledged.length}
        </Badge>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Close"
            tabIndex={-1}
          />
          {/* Popover */}
          <div className="pixel-box absolute right-0 top-12 z-50 w-80 bg-bargo-white">
            <div className="flex items-center justify-between px-4 py-3 border-b-4 border-bargo-ink bg-bargo-bg/40">
              <span className="font-mono font-black uppercase text-xs tracking-wider">
                Intent matches
              </span>
              <button
                type="button"
                className="text-[10px] font-mono uppercase tracking-widest hover:text-bargo-accent"
                onClick={() => {
                  setOpen(false);
                  router.push('/intents');
                }}
              >
                View all →
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y-2 divide-bargo-ink/20">
              {unacknowledged.map((match) => (
                <div key={`${match.intentId}-${match.listingId}`} className="px-4 py-3 space-y-2">
                  <p className="text-sm font-bold line-clamp-1">{match.itemMeta.title}</p>
                  <p className="text-xs opacity-70 line-clamp-2">{match.matchReason}</p>
                  <Button size="sm" onClick={() => handleReview(match)}>
                    Review offer
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
