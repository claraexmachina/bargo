// Status Network uses linea_estimateGas to signal gasless eligibility.
// Returns { gasLimit, baseFeePerGas, priorityFeePerGas } — when gasless is
// available and the sender has Karma quota, returned fee values allow the tx
// to be mined without on-chain gas cost. Falling back to paid gas is automatic
// when the RLN prover is down (currently announced by the org).

import type { Address, Hex } from 'viem';

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

// Minimal client shape — both PublicClient and WalletClient expose `request`.
// linea_estimateGas is a Status/Linea RPC extension not in viem's typed map,
// so we accept a loose request signature and cast internally.
interface RpcClient {
  request: (args: { method: string; params: unknown[] }) => Promise<unknown>;
}

export async function lineaEstimateGas(
  client: { request: unknown },
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

  const raw = await (client as RpcClient).request({
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
