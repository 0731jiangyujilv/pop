import { useChainId, useSendTransaction } from 'wagmi'
import { BASE_BUILDER_CODE_SUFFIX, isBaseChain } from '@/lib/builderCode'

// Raw-calldata sibling of useWriteContractWithAttribution. Use when the
// calldata is produced externally (e.g. returned by the Uniswap Trading API)
// and cannot be expressed as abi + functionName + args.
export function useSendTransactionWithAttribution() {
  const { sendTransactionAsync } = useSendTransaction()
  const chainId = useChainId()

  const sendRaw = async (params: {
    to: `0x${string}`
    data: `0x${string}`
    value?: bigint
  }) => {
    const data = isBaseChain(chainId)
      ? ((params.data + BASE_BUILDER_CODE_SUFFIX) as `0x${string}`)
      : params.data

    return sendTransactionAsync({
      to: params.to,
      data,
      value: params.value,
    })
  }

  return { sendTransactionAsync: sendRaw }
}
