import { useChainId, useSendTransaction } from 'wagmi'
import { encodeFunctionData, type Abi } from 'viem'
import { BASE_BUILDER_CODE_SUFFIX, isBaseChain } from '@/lib/builderCode'

export function useWriteContractWithAttribution() {
  const { sendTransactionAsync } = useSendTransaction()
  const chainId = useChainId()

  const writeContractAsync = async (params: {
    address: `0x${string}`
    abi: Abi | readonly unknown[]
    functionName: string
    args?: readonly unknown[]
    chainId?: number
  }) => {
    const calldata = encodeFunctionData({
      abi: params.abi as Abi,
      functionName: params.functionName,
      args: params.args as unknown[],
    })

    const targetChainId = params.chainId ?? chainId
    const data = isBaseChain(targetChainId)
      ? ((calldata + BASE_BUILDER_CODE_SUFFIX) as `0x${string}`)
      : calldata

    return sendTransactionAsync({
      to: params.address,
      data,
      chainId: params.chainId,
    })
  }

  return { writeContractAsync }
}
