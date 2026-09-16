import { type Chain } from 'viem'
import { baseSepolia, bscTestnet } from 'viem/chains'
import { envConfig, type WebappChainEntry } from './env'

export type ChainConfig = {
  chain: Chain
  betFactoryAddress: `0x${string}`
  usdcAddress: `0x${string}`
  priceOracleFactoryAddress: `0x${string}`
  eventBetFactoryAddress: `0x${string}`
  predictionMarketFactoryAddress: `0x${string}`
  explorerUrl: string
  isTestnet: boolean
}

// Custom chain definition for Arc Testnet (placeholder — update when details are available)
export const arcTestnet: Chain = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://arc-testnet.drpc.org'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  },
  testnet: true,
}

const viemChains: Record<number, Chain> = {
  [arcTestnet.id]: arcTestnet,
  [baseSepolia.id]: baseSepolia,
  [bscTestnet.id]: bscTestnet,
}

// Build SUPPORTED_CHAINS from env config
function buildChains(): Record<number, ChainConfig> {
  const result: Record<number, ChainConfig> = {}

  for (const [idStr, entry] of Object.entries(envConfig.chains) as Array<[string, WebappChainEntry]>) {
    const chainId = Number(idStr)
    const viemChain = viemChains[chainId]
    if (!viemChain) continue

    result[chainId] = {
      chain: viemChain,
      betFactoryAddress: entry.betFactoryAddress as `0x${string}`,
      usdcAddress: entry.usdcAddress as `0x${string}`,
      priceOracleFactoryAddress: entry.priceOracleFactoryAddress as `0x${string}`,
      eventBetFactoryAddress: entry.eventBetFactoryAddress as `0x${string}`,
      predictionMarketFactoryAddress: entry.predictionMarketFactoryAddress as `0x${string}`,
      explorerUrl: entry.explorerUrl,
      isTestnet: entry.isTestnet,
    }
  }

  return result
}

export const SUPPORTED_CHAINS = buildChains()
export const SUPPORTED_CHAIN_IDS = Object.keys(SUPPORTED_CHAINS).map(Number)
export const SUPPORTED_CHAIN_LIST = Object.values(SUPPORTED_CHAINS)

export function getChainConfig(chainId: number): ChainConfig | undefined {
  return SUPPORTED_CHAINS[chainId]
}

// URL slug ⇄ chainId mapping. Pages that pin their chain via the query string
// (e.g. `?chain=base-sepolia`) use these instead of a numeric chainId so links
// are human-readable and decoupled from the connected wallet.
export const CHAIN_SLUGS: Record<string, number> = {
  'arc-testnet': arcTestnet.id,
  'base-sepolia': baseSepolia.id,
  'bsc-testnet': bscTestnet.id,
}

export function getChainIdBySlug(slug: string | null | undefined): number | undefined {
  if (!slug) return undefined
  return CHAIN_SLUGS[slug]
}

export function getChainSlug(chainId: number): string | undefined {
  return Object.keys(CHAIN_SLUGS).find((slug) => CHAIN_SLUGS[slug] === chainId)
}

export function isSupportedChain(chainId: number): boolean {
  return chainId in SUPPORTED_CHAINS
}

// Default chain for new users
export const DEFAULT_CHAIN_ID = arcTestnet.id
