/**
 * Read-only live OddsShift state for the Robinhood judge surface.
 * Never writes, never requires a connected wallet.
 */
import { useMemo } from 'react'
import { formatUnits } from 'viem'
import { useReadContracts } from 'wagmi'
import {
  EVENT_MARKET_V2_ABI,
  PROB_SCALE,
  probToPercent,
  type OddsShiftInfo,
} from '@/config/abi/eventMarketV2'
import {
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_EVENT_MARKET_V2_ADDRESS,
  validatedAddress,
} from '@/config/robinhood'
import { LIVE_ACCOUNTING, LIVE_MARKET } from '@/data/robinhoodLiveEvidence'

export type RobinhoodLiveState = {
  /** True while the first successful read has not landed. */
  loading: boolean
  /** True when the RPC read failed or returned nothing usable. */
  unavailable: boolean
  question: string | undefined
  currentProbPercent: number | undefined
  totalTrades: number | undefined
  totalShocks: number | undefined
  pendingCount: number | undefined
  pendingEscrowUsdg: string | undefined
  rebateOwedUsdg: string | undefined
  lpRewardOwedUsdg: string | undefined
  openShock: boolean | undefined
  cumBaseFeeUsdg: string | undefined
  cumChargedFeeUsdg: string | undefined
  cumRebatedUsdg: string | undefined
  zeroLiabilityLive: boolean | undefined
}

/** Normalize USDG amount for display; keep integer zero as `"0"`. */
export function formatLiveUsdg(v: bigint | undefined): string | undefined {
  if (v === undefined) return undefined
  if (v === 0n) return '0'
  const raw = formatUnits(v, 6)
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  return n.toFixed(6).replace(/\.?0+$/, '')
}

export function useRobinhoodLiveState(
  marketAddress: string | undefined = ROBINHOOD_EVENT_MARKET_V2_ADDRESS,
): RobinhoodLiveState {
  const market = validatedAddress(marketAddress) ?? validatedAddress(LIVE_MARKET.marketAddress)
  const chainId = ROBINHOOD_CHAIN_ID
  const enabled = Boolean(market)

  const reads = useReadContracts({
    contracts: market
      ? [
          { address: market, abi: EVENT_MARKET_V2_ABI, chainId, functionName: 'question' },
          { address: market, abi: EVENT_MARKET_V2_ABI, chainId, functionName: 'getOddsShiftInfo' },
        ]
      : [],
    query: {
      enabled,
      refetchInterval: 15_000,
      retry: 1,
    },
  })

  return useMemo(() => {
    const loading = enabled && reads.isLoading && !reads.data
    const question = reads.data?.[0]?.result as string | undefined
    const os = reads.data?.[1]?.result as OddsShiftInfo | undefined
    const unavailable =
      enabled && (reads.isError || (Boolean(reads.isFetched) && !os && !reads.isLoading))

    if (!os) {
      return {
        loading,
        unavailable,
        question,
        currentProbPercent: undefined,
        totalTrades: undefined,
        totalShocks: undefined,
        pendingCount: undefined,
        pendingEscrowUsdg: undefined,
        rebateOwedUsdg: undefined,
        lpRewardOwedUsdg: undefined,
        openShock: undefined,
        cumBaseFeeUsdg: undefined,
        cumChargedFeeUsdg: undefined,
        cumRebatedUsdg: undefined,
        zeroLiabilityLive: undefined,
      }
    }

    const pendingCount = Number(os.pendingCount)
    const zeroLiabilityLive =
      pendingCount === 0 &&
      os.pendingEscrow === 0n &&
      os.totalRebateOwed === 0n &&
      os.totalLpRewardOwed === 0n &&
      !os.shockOpen

    return {
      loading: false,
      unavailable: false,
      question: question ?? LIVE_MARKET.question,
      currentProbPercent: probToPercent(os.currentProb ?? PROB_SCALE / 2),
      totalTrades: Number(os.totalTrades),
      totalShocks: Number(os.totalShocks),
      pendingCount,
      pendingEscrowUsdg: formatLiveUsdg(os.pendingEscrow),
      rebateOwedUsdg: formatLiveUsdg(os.totalRebateOwed),
      lpRewardOwedUsdg: formatLiveUsdg(os.totalLpRewardOwed),
      openShock: os.shockOpen,
      cumBaseFeeUsdg: formatLiveUsdg(os.cumBaseFee),
      cumChargedFeeUsdg: formatLiveUsdg(os.cumChargedFee),
      cumRebatedUsdg: formatLiveUsdg(os.cumRebated),
      zeroLiabilityLive,
    }
  }, [enabled, reads.data, reads.isError, reads.isFetched, reads.isLoading])
}

/** Static fallback copy when live RPC is unavailable — never fabricate live zeroes. */
export function settledEvidenceFallback() {
  return {
    ...LIVE_ACCOUNTING,
    note: 'Live RPC unavailable — showing immutable settled-demo evidence.',
  }
}
