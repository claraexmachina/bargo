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
> = {
  374: {
    bargoEscrow: '0xd4618b10073CF33d6db87A19CE6Cdbc135C988Ee',
    karmaReader: '0xB8A7Af7Addc49Bfd6517b353231f0a0F6a988287',
    rlnVerifier: '0x26BbdD2c2cB4BE5d6892E4BFb4cB4D52dC2b332B',
  },
};
