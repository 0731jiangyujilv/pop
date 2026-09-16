import { encodeFunctionData, type Abi, type PublicClient, type WalletClient } from "viem"
import { BASE_BUILDER_CODE_SUFFIX, isBaseChain } from "../builderCode"

export async function writeContractWithAttribution(
  wallet: WalletClient,
  client: PublicClient,
  params: {
    address: `0x${string}`
    abi: Abi | readonly unknown[]
    functionName: string
    args?: readonly unknown[]
  },
): Promise<`0x${string}`> {
  const calldata = encodeFunctionData({
    abi: params.abi as Abi,
    functionName: params.functionName,
    args: params.args as unknown[],
  })

  const data = isBaseChain(client.chain?.id)
    ? ((calldata + BASE_BUILDER_CODE_SUFFIX) as `0x${string}`)
    : calldata

  return wallet.sendTransaction({
    account: wallet.account!,
    chain: client.chain,
    to: params.address,
    data,
  })
}
