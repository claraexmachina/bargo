// Status Network gasless-ready gas estimation.
// Calls linea_estimateGas on the Hoodi RPC — when gasless is active and the
// sender has Karma quota, returned fee values let the tx mine without gas.
// When the RLN prover is down (org-announced), returns real fee values and
// the tx is paid-gas; no code change needed when gasless comes back.

import type { Address, Hex, PublicClient } from 'viem';

export interface LineaGas {
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export interface LineaGasTxInput {
  from: Address;
  to: Address;
  data: Hex;
  value?: bigint;
}

interface LineaEstimateResult {
  gasLimit: Hex;
  baseFeePerGas: Hex;
  priorityFeePerGas: Hex;
}

export async function lineaEstimateGas(
  client: PublicClient,
  tx: LineaGasTxInput,
): Promise<LineaGas> {
  const params: Record<string, Hex> = {
    from: tx.from,
    to: tx.to,
    data: tx.data,
  };
  if (tx.value !== undefined) {
    params.value = `0x${tx.value.toString(16)}`;
  }

  const raw = await (client as { request: (a: { method: string; params: unknown[] }) => Promise<unknown> }).request({
    method: 'linea_estimateGas',
    params: [params],
  });

  const result = raw as LineaEstimateResult;
  const baseFeePerGas = BigInt(result.baseFeePerGas);
  const priorityFeePerGas = BigInt(result.priorityFeePerGas);

  return {
    gas: BigInt(result.gasLimit),
    maxFeePerGas: baseFeePerGas + priorityFeePerGas,
    maxPriorityFeePerGas: priorityFeePerGas,
  };
}
