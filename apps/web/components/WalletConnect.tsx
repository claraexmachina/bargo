'use client';

import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { Button } from '@/components/ui/button';
import { truncateAddress } from '@/lib/format';

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
          aria-label="지갑 연결 해제"
        >
          연결 해제
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
      aria-label="지갑 연결"
    >
      {isPending ? '연결 중...' : '지갑 연결 (Wallet)'}
    </Button>
  );
}
