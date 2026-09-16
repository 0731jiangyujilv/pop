import type { PublicClient, WalletClient, Abi } from "viem"
import { ContractFunctionRevertedError, BaseError } from "viem"

export type SimulateParams = {
  address: `0x${string}`
  abi: Abi | readonly unknown[]
  functionName: string
  args?: readonly unknown[]
}

/**
 * Extract a human-readable revert reason from a viem error.
 */
export function extractRevertReason(error: unknown): string {
  if (error instanceof BaseError) {
    const revertError = error.walk(
      (e) => e instanceof ContractFunctionRevertedError
    )
    if (revertError instanceof ContractFunctionRevertedError) {
      const reason = revertError.data?.errorName
        ? `${revertError.data.errorName}${revertError.data.args ? `(${revertError.data.args.join(", ")})` : ""}`
        : revertError.reason
      if (reason) return reason
    }

    if (error.shortMessage) return error.shortMessage
  }

  if (error instanceof Error) {
    return error.message.slice(0, 300)
  }

  return "Transaction simulation failed"
}

/**
 * Simulate a contract write before sending. Throws with a readable
 * revert reason if the transaction would fail on-chain.
 */
export async function simulateBeforeWrite(
  client: PublicClient,
  wallet: WalletClient,
  params: SimulateParams
): Promise<void> {
  try {
    await client.simulateContract({
      address: params.address,
      abi: params.abi as Abi,
      functionName: params.functionName,
      args: params.args as any,
      account: wallet.account!,
    })
  } catch (error) {
    const reason = extractRevertReason(error)
    throw new Error(`Simulation failed for ${params.functionName}: ${reason}`)
  }
}
