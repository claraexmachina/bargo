'use client';

import { hoodiChain } from '@haggle/shared';
import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';

// Status Network Hoodi testnet RPC
// Gasless: Status Network supports gasless tx via their relayer.
// Current status: standard RPC wired. Gasless not yet confirmed — see README.
export const wagmiConfig = createConfig({
  chains: [hoodiChain],
  connectors: [injected()],
  transports: {
    [hoodiChain.id]: http(
      process.env.NEXT_PUBLIC_RPC_URL ?? 'https://public.hoodi.rpc.status.network'
    ),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
