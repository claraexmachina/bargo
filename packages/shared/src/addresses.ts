import type { Address } from './types.js';

// Deployed contract addresses, keyed by chain ID.
// Populated by contract-lead via PR after each deploy.
export const ADDRESSES: Record<
  number,
  {
    bargoEscrow: Address;
    karmaReader: Address;
    rlnVerifier: Address;
  }
> = {};
