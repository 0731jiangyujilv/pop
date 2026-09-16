import { createRpcTransport, getRpcUrls } from "@polypop/rpc"
import { createPublicClient, createWalletClient, type Chain, type PublicClient, type WalletClient } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { baseSepolia, base, bscTestnet } from "viem/chains"
import { config } from "./config"
import { envConfig, type ChainEntry } from "./env"

export type ChainConfig = {
  chainId: number
  chain: Chain
  name: string
  rpcUrls: string[]
  betFactoryAddress: string
  priceOracleFactoryAddress: string
  eventBetFactoryAddress: string
  predictionMarketFactoryAddress: string
  usdcAddress: string
  explorerUrl: string
  verifierUrl: string
  isTestnet: boolean
}

// Custom chain definition for Arc Testnet (placeholder — update when details are available)
export const arcTestnet: Chain = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: getRpcUrls(5042002, process.env) },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
}

// Map chainId -> viem Chain object
const viemChains: Record<number, Chain> = {
  [baseSepolia.id]: baseSepolia,
  [base.id]: base,
  [bscTestnet.id]: bscTestnet,
  [arcTestnet.id]: arcTestnet,
}

// Build SUPPORTED_CHAINS from env config
function buildChainConfigs(): Record<number, ChainConfig> {
  const chains: Record<number, ChainConfig> = {}

  for (const [idStr, entry] of Object.entries(envConfig.CHAINS) as Array<[string, ChainEntry]>) {
    const chainId = Number(idStr)
    const viemChain = viemChains[chainId]
    if (!viemChain) {
      console.warn(`[chains] No viem chain definition for chainId ${chainId}, skipping`)
      continue
    }

    chains[chainId] = {
      chainId,
      chain: viemChain,
      name: entry.name,
      rpcUrls: getRpcUrls(chainId, process.env),
      betFactoryAddress: entry.betFactoryAddress,
      priceOracleFactoryAddress: entry.priceOracleFactoryAddress,
      eventBetFactoryAddress: entry.eventBetFactoryAddress,
      predictionMarketFactoryAddress: entry.predictionMarketFactoryAddress,
      usdcAddress: entry.usdcAddress,
      explorerUrl: entry.explorerUrl,
      verifierUrl: entry.verifierUrl,
      isTestnet: entry.isTestnet,
    }
  }

  return chains
}

export const SUPPORTED_CHAINS = buildChainConfigs()
export const SUPPORTED_CHAIN_IDS = Object.keys(SUPPORTED_CHAINS).map(Number)

export function getChainConfig(chainId: number): ChainConfig | undefined {
  return SUPPORTED_CHAINS[chainId]
}

export function isSupportedChain(chainId: number): boolean {
  return chainId in SUPPORTED_CHAINS
}

// --- Viem clients per chain ---

const publicClients = new Map<number, PublicClient>()
const walletClients = new Map<number, WalletClient>()

export function getPublicClient(chainId: number): PublicClient {
  const existing = publicClients.get(chainId)
  if (existing) return existing

  const chainCfg = SUPPORTED_CHAINS[chainId]
  if (!chainCfg) throw new Error(`Unsupported chain: ${chainId}`)

  const client = createPublicClient({
    chain: chainCfg.chain,
    transport: createRpcTransport(chainId, chainCfg.rpcUrls),
  })
  publicClients.set(chainId, client as PublicClient)
  return client as PublicClient
}

export function getWalletClient(chainId: number): WalletClient | null {
  if (!config.BOT_PRIVATE_KEY) return null

  const existing = walletClients.get(chainId)
  if (existing) return existing

  const chainCfg = SUPPORTED_CHAINS[chainId]
  if (!chainCfg) throw new Error(`Unsupported chain: ${chainId}`)

  const client = createWalletClient({
    account: privateKeyToAccount(config.BOT_PRIVATE_KEY as `0x${string}`),
    chain: chainCfg.chain,
    transport: createRpcTransport(chainId, chainCfg.rpcUrls),
  })
  walletClients.set(chainId, client)
  return client
}
