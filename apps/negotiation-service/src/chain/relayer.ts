// Relayer — signs and submits settleNegotiation on-chain via viem WalletClient.
// Uses RELAYER_PRIVATE_KEY env var. Waits for 1 confirmation.

import { createWalletClient, createPublicClient, http, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hoodiChain, bargoEscrowAbi } from '@bargo/shared';
import type { Hex, DealId, ListingId, OfferId } from '@bargo/shared';

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
 * Submit settleNegotiation to BargoEscrow and wait for 1 confirmation.
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

  // Simulate first to surface revert reason, then write using the exact same
  // calldata from the simulation result — eliminates the race window between
  // simulate and write, and ensures nonce is consumed atomically.
  let simulateRequest: Parameters<typeof walletClient.writeContract>[0];
  try {
    const simulateResult = await walletClient.simulateContract({
      address: opts.escrowAddress,
      abi: bargoEscrowAbi,
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
    simulateRequest = simulateResult.request as Parameters<typeof walletClient.writeContract>[0];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`settleNegotiation simulation reverted: ${message}`);
  }

  const txHash = await walletClient.writeContract(simulateRequest);

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
