'use client';

import { Button } from '@/components/ui/button';
import { truncateAddress } from '@/lib/format';
import { useAccount, useConnect, useDisconnect } from 'wagmi';

export function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono text-muted-foreground">{truncateAddress(address)}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => disconnect()}
          aria-label="Disconnect wallet"
        >
          Disconnect
        </Button>
      </div>
    );
  }

  const injectedConnector = connectors.find((c) => c.type === 'injected');

  return (
    <Button
      onClick={() => {
        if (injectedConnector) connect({ connector: injectedConnector });
      }}
      disabled={isPending || !injectedConnector}
      size="sm"
      aria-label="Connect wallet"
    >
      {isPending ? 'Connecting...' : 'Connect wallet'}
    </Button>
  );
}
