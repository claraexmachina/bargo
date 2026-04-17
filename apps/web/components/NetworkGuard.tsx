'use client';

import { Button } from '@/components/ui/button';
import { useMounted } from '@/lib/use-mounted';
import { hoodiChain } from '@bargo/shared';
import { useState } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';

/**
 * Shows a pixel-style banner when the user is on the wrong network,
 * with a one-click button to switch (or add) Status Network Hoodi.
 *
 * Common confusion: MetaMask's "Hoodi" preset is often the *Ethereum L1* Hoodi
 * testnet (chainId 560048), not Status Network's L2 Hoodi (chainId 374).
 * wallet_addEthereumChain nudges MetaMask to register the correct L2.
 */
export function NetworkGuard() {
  const mounted = useMounted();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending } = useSwitchChain();
  const [error, setError] = useState<string | null>(null);

  // Suppress SSR/client mismatch — wallet state is browser-only
  if (!mounted || !isConnected || chainId === hoodiChain.id) return null;

  async function addAndSwitch() {
    setError(null);
    try {
      await switchChainAsync({ chainId: hoodiChain.id });
      return;
    } catch {
      // Fall through to explicit add
    }

    const ethereum = (
      window as unknown as {
        ethereum?: { request: (args: { method: string; params: unknown[] }) => Promise<unknown> };
      }
    ).ethereum;
    if (!ethereum) {
      setError('No wallet detected.');
      return;
    }

    try {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: `0x${hoodiChain.id.toString(16)}`,
            chainName: hoodiChain.name,
            nativeCurrency: hoodiChain.nativeCurrency,
            rpcUrls: hoodiChain.rpcUrls.default.http,
            blockExplorerUrls: hoodiChain.blockExplorers
              ? [hoodiChain.blockExplorers.default.url]
              : [],
          },
        ],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add network';
      setError(message);
    }
  }

  return (
    <div className="pixel-box bg-bargo-soft p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 space-y-1">
        <p className="font-mono text-xs font-black uppercase tracking-wider">
          Wrong network — currently on chainId {chainId}
        </p>
        <p className="text-xs opacity-80 leading-snug">
          Bargo uses <strong>Status Network Hoodi</strong> (chainId {hoodiChain.id}). MetaMask's
          default "Hoodi" preset is the Ethereum L1 testnet (560048) — not the same.
        </p>
        {error && <p className="text-xs text-destructive font-mono mt-1">{error}</p>}
      </div>
      <Button size="sm" onClick={addAndSwitch} disabled={isPending}>
        {isPending ? 'Switching...' : 'Switch network'}
      </Button>
    </div>
  );
}
