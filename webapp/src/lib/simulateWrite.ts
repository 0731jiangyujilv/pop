import type { PublicClient, Abi } from 'viem'
import {
  ContractFunctionRevertedError,
  BaseError,
} from 'viem'

export type SimulateRequest = {
  address: `0x${string}`
  abi: Abi | readonly unknown[]
  functionName: string
  args?: readonly unknown[]
  account: `0x${string}`
}

/**
 * Extract a human-readable revert reason from a viem error.
 */
export function extractRevertReason(error: unknown): string {
  if (error instanceof BaseError) {
    // Walk the cause chain to find ContractFunctionRevertedError
    const revertError = error.walk(
      (e) => e instanceof ContractFunctionRevertedError
    )
    if (revertError instanceof ContractFunctionRevertedError) {
      const reason = revertError.data?.errorName
        ? `${revertError.data.errorName}${revertError.data.args ? `(${revertError.data.args.join(', ')})` : ''}`
        : revertError.reason
      if (reason) return reason
    }

    // Fallback to shortMessage
    if (error.shortMessage) return error.shortMessage
  }

  if (error instanceof Error) {
    return error.message.slice(0, 200)
  }

  return 'Transaction simulation failed'
}

/**
 * Simulate a contract write call before sending. Throws with a readable
 * revert reason if the transaction would fail on-chain.
 */
export async function simulateWrite(
  publicClient: PublicClient,
  request: SimulateRequest
): Promise<void> {
  try {
    await publicClient.simulateContract({
      address: request.address,
      abi: request.abi as Abi,
      functionName: request.functionName,
      args: request.args as any,
      account: request.account,
    })
  } catch (error) {
    throw new Error(extractRevertReason(error))
  }
}
