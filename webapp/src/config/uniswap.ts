export const NATIVE_ETH_SENTINEL = '0x0000000000000000000000000000000000000000' as const

// Chains where the Uniswap Trading API is available.
// Base Sepolia is included for testing; the API may return no-routes on testnet —
// the UI degrades gracefully with an error message in that case.
export const UNISWAP_SUPPORTED_CHAIN_IDS = [8453, 84532] as const
export type UniswapSupportedChainId = (typeof UNISWAP_SUPPORTED_CHAIN_IDS)[number]

export const DEFAULT_SLIPPAGE_PERCENT = '0.5'
export const STABLE_SLIPPAGE_PERCENT = '0.5'
export const VOLATILE_SLIPPAGE_PERCENT = '1.0'

export const ETH_GAS_BUFFER_WEI = 500_000_000_000_000n

export const QUOTE_STALE_MS = 25_000

export const HIGH_PRICE_IMPACT_PERCENT = 3

// Mirrors bot's UNISWAP_FEE_BPS. Used to gross up the requested output so the
// swapper receives the displayed USDC amount after the integrator fee.
const rawFeeBps = Number(import.meta.env.VITE_UNISWAP_FEE_BPS ?? '0')
export const INTEGRATOR_FEE_BPS: number = Number.isFinite(rawFeeBps) && rawFeeBps > 0 && rawFeeBps < 10_000 ? Math.floor(rawFeeBps) : 0

export function grossUpForFee(amount: bigint): bigint {
  if (INTEGRATOR_FEE_BPS <= 0 || amount <= 0n) return amount
  const denom = 10_000n - BigInt(INTEGRATOR_FEE_BPS)
  return (amount * 10_000n + denom - 1n) / denom
}

export type SwappableToken = {
  symbol: string
  address: `0x${string}`
  decimals: number
  isNative: boolean
  isStable: boolean
}

// Base mainnet (8453)
export const SWAPPABLE_TOKENS_BASE: SwappableToken[] = [
  { symbol: 'ETH',  address: NATIVE_ETH_SENTINEL,                          decimals: 18, isNative: true,  isStable: false },
  { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18, isNative: false, isStable: false },
  { symbol: 'USDT', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6,  isNative: false, isStable: true  },
  { symbol: 'DAI',  address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, isNative: false, isStable: true  },
]

// Base Sepolia (84532) — only ETH and WETH are reliably available on testnet
export const SWAPPABLE_TOKENS_BASE_SEPOLIA: SwappableToken[] = [
  { symbol: 'ETH',  address: NATIVE_ETH_SENTINEL,                          decimals: 18, isNative: true,  isStable: false },
  { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18, isNative: false, isStable: false },
]

// USDC address per chain (the swap output token)
const USDC_BY_CHAIN: Record<number, `0x${string}`> = {
  8453:  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
}

export function getUsdcAddress(chainId: number): `0x${string}` {
  return USDC_BY_CHAIN[chainId] ?? USDC_BY_CHAIN[8453]
}

export function getSwappableTokens(chainId: number): SwappableToken[] {
  if (chainId === 84532) return SWAPPABLE_TOKENS_BASE_SEPOLIA
  return SWAPPABLE_TOKENS_BASE
}

export function isUniswapSupported(chainId: number): boolean {
  return (UNISWAP_SUPPORTED_CHAIN_IDS as readonly number[]).includes(chainId)
}

export function slippageFor(token: SwappableToken): string {
  return token.isStable ? STABLE_SLIPPAGE_PERCENT : VOLATILE_SLIPPAGE_PERCENT
}
