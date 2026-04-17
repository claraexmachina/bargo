// Relayer — signs and submits settleNegotiation on-chain via viem WalletClient.
// Uses RELAYER_PRIVATE_KEY env var. Waits for 1 confirmation.
// Gas is estimated via linea_estimateGas so the tx is gasless when Status
// Network's RLN prover + Karma tier allow it (paid gas otherwise).

import { bargoEscrowAbi, hoodiChain } from '@bargo/shared';
import type { DealId, Hex, ListingId, OfferId } from '@bargo/shared';
import {
  http,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  publicActions,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { lineaEstimateGas } from './lineaEstimateGas.js';

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

  const callArgs = [
    opts.listingId,
    opts.offerId,
    opts.agreedPriceWei,
    opts.agreedConditionsHash,
    opts.nearAiAttestationHash,
  ] as const;

  // Simulate first to surface revert reason, then write using the exact same
  // calldata from the simulation result — eliminates the race window between
  // simulate and write, and ensures nonce is consumed atomically.
  let simulateRequest: Parameters<typeof walletClient.writeContract>[0];
  try {
    const simulateResult = await walletClient.simulateContract({
      address: opts.escrowAddress,
      abi: bargoEscrowAbi,
      functionName: 'settleNegotiation',
      args: callArgs,
      account,
    });
    simulateRequest = simulateResult.request as Parameters<typeof walletClient.writeContract>[0];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`settleNegotiation simulation reverted: ${message}`);
  }

  // Status Network gasless: linea_estimateGas returns gas limit + fee fields that
  // are zero when the sender has Karma quota (gasless), real values otherwise.
  const data = encodeFunctionData({
    abi: bargoEscrowAbi,
    functionName: 'settleNegotiation',
    args: callArgs,
  });
  const estimated = await lineaEstimateGas(walletClient, {
    from: account.address,
    to: opts.escrowAddress,
    data,
  });

  // Gas fields injected via type-asserted spread — viem's WriteContractParameters
  // narrows tx type by presence of fee fields; we keep the simulation's exact
  // calldata and add EIP-1559 fee values from linea_estimateGas.
  const writeReq = {
    ...simulateRequest,
    gas: estimated.gas,
    maxFeePerGas: estimated.maxFeePerGas,
    maxPriorityFeePerGas: estimated.maxPriorityFeePerGas,
  } as Parameters<typeof walletClient.writeContract>[0];
  const txHash = await walletClient.writeContract(writeReq);

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
