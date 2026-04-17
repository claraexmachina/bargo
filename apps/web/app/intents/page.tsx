'use client';

import { WalletConnect } from '@/components/WalletConnect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { deleteIntent, useAckIntentMatch, useIntentMatches, useIntents } from '@/lib/api';
import type { IntentId, IntentMatch, IntentPublic, ListingId } from '@bargo/shared';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';

function daysUntil(unixSeconds: number): number {
  return Math.max(0, Math.round((unixSeconds * 1000 - Date.now()) / 86_400_000));
}

function filtersSummary(intent: IntentPublic): string {
  const parts: string[] = [];
  if (intent.filters.category) parts.push(intent.filters.category);
  if (intent.filters.requiredKarmaTierCeiling !== undefined)
    parts.push(`tier ≤ ${intent.filters.requiredKarmaTierCeiling}`);
  return parts.length > 0 ? parts.join(', ') : 'any';
}

function scoreBadgeVariant(score: IntentMatch['score']): 'default' | 'secondary' | 'outline' {
  if (score === 'match') return 'default';
  if (score === 'likely') return 'secondary';
  return 'outline';
}

function IntentCard({
  intent,
  onCancel,
}: {
  intent: IntentPublic;
  onCancel: (id: IntentId) => void;
}) {
  const expires = daysUntil(intent.expiresAt);
  const created = new Date(intent.createdAt * 1000).toLocaleDateString();

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{filtersSummary(intent)}</CardTitle>
          <Badge variant={intent.active ? 'default' : 'outline'}>
            {intent.active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Expires in {expires} day{expires !== 1 ? 's' : ''} &middot; Created {created}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCancel(intent.id)}
          className="text-destructive hover:text-destructive"
        >
          Cancel intent
        </Button>
      </CardContent>
    </Card>
  );
}

function MatchCard({ match, onReview }: { match: IntentMatch; onReview: () => void }) {
  return (
    <Card className={match.acknowledged ? 'opacity-60' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{match.itemMeta.title}</CardTitle>
          <Badge variant={scoreBadgeVariant(match.score)}>{match.score}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground line-clamp-2">{match.matchReason}</p>
        <p className="text-xs text-muted-foreground">
          {match.itemMeta.category} &middot; Karma tier {match.requiredKarmaTier} required &middot;{' '}
          {new Date(match.matchedAt * 1000).toLocaleDateString()}
        </p>
        <Button size="sm" onClick={onReview} disabled={match.acknowledged}>
          {match.acknowledged ? 'Reviewed' : 'Review offer'}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function IntentsPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  const {
    data: intentsData,
    isLoading: intentsLoading,
    refetch: refetchIntents,
  } = useIntents(address);
  const { data: matchesData, isLoading: matchesLoading } = useIntentMatches(address);
  const ackMatch = useAckIntentMatch();

  const [cancelling, setCancelling] = React.useState<IntentId | null>(null);

  async function handleCancel(id: IntentId) {
    if (!address) return;
    setCancelling(id);
    try {
      await deleteIntent(id, address);
      toast.success('Intent cancelled.');
      void refetchIntents();
    } catch {
      toast.error('Failed to cancel intent. Please try again.');
    } finally {
      setCancelling(null);
    }
  }

  function handleReview(match: IntentMatch) {
    void ackMatch.mutateAsync(
      { intentId: match.intentId, listingId: match.listingId as ListingId },
      {
        onError: () => {
          // Non-blocking — navigate anyway
        },
      },
    );
    router.push(`/offers/new/${match.listingId}?fromIntent=${match.intentId}`);
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
        <p className="text-xl font-semibold">Connect your wallet to view intents</p>
        <WalletConnect />
      </div>
    );
  }

  const intents = intentsData?.intents ?? [];
  const matches = matchesData?.matches ?? [];
  const unacknowledged = matches.filter((m) => !m.acknowledged);

  return (
    <div className="space-y-8 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Standing intents</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Agents search new listings and notify you on match.
          </p>
        </div>
        <Button onClick={() => router.push('/intents/new')}>+ New intent</Button>
      </div>

      {/* Active intents */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Your intents</h2>
        {intentsLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {!intentsLoading && intents.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No standing intents yet.{' '}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => router.push('/intents/new')}
            >
              Create one
            </button>{' '}
            to let agents discover listings for you.
          </p>
        )}
        {intents.map((intent) => (
          <IntentCard
            key={intent.id}
            intent={intent}
            onCancel={cancelling === intent.id ? () => {} : handleCancel}
          />
        ))}
      </section>

      {/* Matches */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Your matches</h2>
          {unacknowledged.length > 0 && (
            <Badge variant="default">{unacknowledged.length} new</Badge>
          )}
        </div>
        {matchesLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {!matchesLoading && matches.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No matches yet. Agents check new listings every few minutes.
          </p>
        )}
        {matches.map((match) => (
          <MatchCard
            key={`${match.intentId}-${match.listingId}`}
            match={match}
            onReview={() => handleReview(match)}
          />
        ))}
      </section>
    </div>
  );
}
