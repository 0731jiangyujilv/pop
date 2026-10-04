import type { Address, Chain } from 'viem'

export const ROBINHOOD_CHAIN_ID = 46_630
export const ROBINHOOD_CHAIN_SLUG = 'robinhood'
export const ROBINHOOD_CHAIN_SLUG_ALIAS = 'robinhood-testnet'
export const ROBINHOOD_RPC_URL = 'https://rpc.testnet.chain.robinhood.com'
export const ROBINHOOD_EXPLORER_URL = 'https://explorer.testnet.chain.robinhood.com'
export const ROBINHOOD_USDG_ADDRESS = '0x7E955252E15c84f5768B83c41a71F9eba181802F' as Address

/** Live settled OddsShift demo market on Robinhood Chain Testnet. */
export const ROBINHOOD_EVENT_MARKET_V2_ADDRESS =
  '0x4F946Cca7f8da191168f76Fe12fbD6cfa1CAA26e' as Address

export const ROBINHOOD_DEPLOYER_ADDRESS =
  '0xA5B709025224bA08B8eFfF1b0D1d28E970A34Cf3' as Address

/** Sourcify verification job that returned an exact creation + runtime match. */
export const ROBINHOOD_SOURCIFY_VERIFICATION_ID = 'e81be92a-9950-4d1e-a453-753456c39434'

export const robinhoodTestnet: Chain = {
  id: ROBINHOOD_CHAIN_ID,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [ROBINHOOD_RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'Robinhood Chain Explorer', url: ROBINHOOD_EXPLORER_URL },
  },
  testnet: true,
}

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

/** Production-facing addresses fail closed instead of falling back to another deployment. */
export function validatedAddress(value: string | null | undefined): Address | undefined {
  const candidate = value?.trim()
  if (!candidate || !ADDRESS_PATTERN.test(candidate) || candidate.toLowerCase() === ZERO_ADDRESS) {
    return undefined
  }
  return candidate as Address
}

export function resolveRobinhoodMarketAddress(
  explicitAddress: string | null | undefined,
  configuredAddress: string | null | undefined,
): Address | undefined {
  return validatedAddress(explicitAddress ?? configuredAddress)
}

export function resolveRobinhoodRpcUrl(override: string | null | undefined): string {
  const candidate = override?.trim()
  if (!candidate) return ROBINHOOD_RPC_URL

  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' || url.protocol === 'http:' ? candidate : ROBINHOOD_RPC_URL
  } catch {
    return ROBINHOOD_RPC_URL
  }
}

export function getRobinhoodChainIdBySlug(slug: string | null | undefined): number | undefined {
  return slug === ROBINHOOD_CHAIN_SLUG || slug === ROBINHOOD_CHAIN_SLUG_ALIAS
    ? ROBINHOOD_CHAIN_ID
    : undefined
}

export function isWalletOnWrongChain(
  isConnected: boolean,
  walletChainId: number,
  requiredChainId: number,
): boolean {
  return isConnected && walletChainId !== requiredChainId
}

export function addressExplorerUrl(explorerUrl: string, address: Address | string): string {
  return `${explorerUrl.replace(/\/$/, '')}/address/${address}`
}

export function txExplorerUrl(explorerUrl: string, txHash: string): string {
  return `${explorerUrl.replace(/\/$/, '')}/tx/${txHash}`
}

export function robinhoodAddressUrl(address: Address | string): string {
  return addressExplorerUrl(ROBINHOOD_EXPLORER_URL, address)
}

export function robinhoodTxUrl(txHash: string): string {
  return txExplorerUrl(ROBINHOOD_EXPLORER_URL, txHash)
}

/** Compact hash for dense evidence tables (`0x0c3f…f0b2`). */
export function shortHash(value: string, left = 6, right = 4): string {
  if (!value || value.length <= left + right + 1) return value
  return `${value.slice(0, left)}…${value.slice(-right)}`
}

/**
 * Sourcify lookup page for the live Robinhood market.
 * Exact-match verification succeeded; Blockscout forwarding did not.
 */
export function sourcifyLookupUrl(
  address: Address | string = ROBINHOOD_EVENT_MARKET_V2_ADDRESS,
  chainId: number = ROBINHOOD_CHAIN_ID,
): string {
  return `https://repo.sourcify.dev/contracts/full_match/${chainId}/${address}/`
}

export function shouldShowTokenFaucet(
  faucetEnabled: boolean,
  isConnected: boolean,
  tokenAddress: Address | undefined,
): boolean {
  return faucetEnabled && isConnected && Boolean(tokenAddress)
}
