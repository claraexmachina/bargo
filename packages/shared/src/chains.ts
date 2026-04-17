import { defineChain } from 'viem';

// Status Network Hoodi Testnet
// Chain ID: 374 (0x176) — confirmed from https://docs.status.network/overview/general-info/network-details
// RPC: https://public.hoodi.rpc.status.network — confirmed from same source
// Explorer: https://hoodiscan.status.network
export const hoodiChain = defineChain({
  id: 374,
  name: 'Status Network Hoodi Testnet',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://public.hoodi.rpc.status.network'],
    },
  },
  blockExplorers: {
    default: {
      name: 'HoodiScan',
      url: 'https://hoodiscan.status.network',
    },
  },
  testnet: true,
});
