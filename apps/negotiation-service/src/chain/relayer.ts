// Relayer — signs and submits settleNegotiation on-chain via viem WalletClient.
// Uses RELAYER_PRIVATE_KEY env var. Waits for 1 confirmation.

import { createWalletClient, createPublicClient, http, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hoodiChain, haggleEscrowAbi } from '@haggle/shared';
import type { Hex, DealId, ListingId, OfferId } from '@haggle/shared';

export interface SubmitSettlementOpts {
  dealId: DealId;
  listingId: ListingId;
  offerId: OfferId;
  agreedPriceWei: bigint;
  agreedConditionsHash: Hex;
  nearAiAttestationHash: Hex;
  relayerPrivateKey: Hex;
  rpcUrl: string;
  escrowAddress: Hex;
}

/**
 * Submit settleNegotiation to HaggleEscrow and wait for 1 confirmation.
 * Returns the on-chain transaction hash.
 * Throws on revert with a descriptive error message.
 */
export async function submitSettlement(opts: SubmitSettlementOpts): Promise<Hex> {
  const account = privateKeyToAccount(opts.relayerPrivateKey);

  const walletClient = createWalletClient({
    account,
    chain: hoodiChain,
    transport: http(opts.rpcUrl),
  }).extend(publicActions);

  // Simulate first to get a descriptive revert reason
  try {
    await walletClient.simulateContract({
      address: opts.escrowAddress,
      abi: haggleEscrowAbi,
      functionName: 'settleNegotiation',
      args: [
        opts.listingId,
        opts.offerId,
        opts.agreedPriceWei,
        opts.agreedConditionsHash,
        opts.nearAiAttestationHash,
      ],
      account,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`settleNegotiation simulation reverted: ${message}`);
  }

  const txHash = await walletClient.writeContract({
    address: opts.escrowAddress,
    abi: haggleEscrowAbi,
    functionName: 'settleNegotiation',
    args: [
      opts.listingId,
      opts.offerId,
      opts.agreedPriceWei,
      opts.agreedConditionsHash,
      opts.nearAiAttestationHash,
    ],
    account,
  });

  // Wait for 1 block confirmation
  const publicClient = createPublicClient({
    chain: hoodiChain,
    transport: http(opts.rpcUrl),
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status === 'reverted') {
    throw new Error(`settleNegotiation tx reverted: ${txHash}`);
  }

  return txHash;
}
