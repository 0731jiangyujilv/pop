/**
 * User portfolio aggregator.
 *
 * Given a wallet address, walks every EventMarket (YES/NO AMM) listed in
 * bot/config/event-market-deployments.ts across all supported chains and reads
 * the wallet's on-chain positions (YES/NO outcome tokens + LP shares), valuing
 * each in USDC. All values are estimates:
 *
 *   - YES/NO tokens (live)     : marked to market via reserves (yesProbability).
 *   - YES/NO tokens (settled)  : valued via netUsdcPer{Yes,No}Token.
 *   - LP position              : lpShares/totalLpShares * totalCollateral.
 *   - Claimable                : redeemable token value + (settled & unclaimed
 *                                LP payout).
 *
 * Pure read-of-chain; never moves funds. Backs the GET /api/portfolio endpoint.
 */
import { formatUnits, getAddress, type PublicClient } from "viem"
import { getPublicClient, isSupportedChain } from "../chains"
import { getReferralSummary } from "./referrals"
// Import the JSON mirror of config/event-market-deployments.ts. The .ts source
// lives outside src/ (shared with bot/scripts), so importing it directly trips
// tsc's rootDir check; the .json is data-only and imports cleanly.
import deploymentsJson from "../../../config/event-market-deployments.json"

type MarketEntry = {
  address: string
  question: string
  match: string
  teamA?: string
  teamB?: string
  stage: string
  deployBlock?: number
}
type ChainEntry = { chainId: number; slug: string; label: string; markets: MarketEntry[] }
const deployments = deploymentsJson as ChainEntry[]

const USDC_DECIMALS = 6
// EventMarket YES/NO outcome tokens are minted 1:1 with USDC collateral
// (see EventMarket.sol `_buyYes`: `yesBalanceOf[to] += usdcAmount`), so they
// share USDC's 6 decimals — NOT 18. The invariant
// `userYesBalance + yesReserve == totalCollateral` is entirely in USDC units.
const TOKEN_DECIMALS = 6
// `netUsdcPer{Yes,No}Token` is a 1e18-scaled fraction (contract `ONE = 1e18`).
const RATE_SCALE = 10n ** 18n

// EventMarket status enum (see contracts/src/EventMarket.sol).
const STATUS_LABELS: Record<number, string> = { 0: "Open", 1: "Locked", 2: "Settled" }
const STATUS_SETTLED = 2

// getMarketInfo() tuple fields (see EventMarket.MarketInfo / IEventMarket).
const MARKET_INFO_COMPONENTS = [
  { name: "creator", type: "address" },
  { name: "platform", type: "address" },
  { name: "admin", type: "address" },
  { name: "token", type: "address" },
  { name: "question", type: "string" },
  { name: "resolutionSource", type: "string" },
  { name: "bettingDeadline", type: "uint256" },
  { name: "resolveAfter", type: "uint256" },
  { name: "status", type: "uint8" },
  { name: "yesWins", type: "bool" },
  { name: "isDraw", type: "bool" },
  { name: "yesReserve", type: "uint256" },
  { name: "noReserve", type: "uint256" },
  { name: "totalCollateral", type: "uint256" },
  { name: "totalLpShares", type: "uint256" },
  { name: "lpSwapFeeBps", type: "uint256" },
  { name: "platformFeeBps", type: "uint256" },
  { name: "creatorFeeBps", type: "uint256" },
  { name: "netUsdcPerYesToken", type: "uint256" },
  { name: "netUsdcPerNoToken", type: "uint256" },
] as const

// getUserState() second return — the user's balances + cumulative USDC flows
// (see EventMarket.UserState / IEventMarket).
const USER_STATE_COMPONENTS = [
  { name: "yesBalance", type: "uint256" },
  { name: "noBalance", type: "uint256" },
  { name: "lpShares", type: "uint256" },
  { name: "lockedLpShares", type: "uint256" },
  { name: "lpClaimed", type: "bool" },
  { name: "usdcIn", type: "uint256" },
  { name: "usdcOut", type: "uint256" },
] as const

// One view returns everything the portfolio needs for a market in a single
// eth_call: market valuation state + the wallet's position + its cumulative USDC
// flows (cost basis). No historical event scanning.
const EVENT_MARKET_ABI = [
  {
    type: "function",
    name: "getUserState",
    stateMutability: "view",
    inputs: [{ name: "u", type: "address" }],
    outputs: [
      { name: "info", type: "tuple", components: MARKET_INFO_COMPONENTS },
      { name: "pos", type: "tuple", components: USER_STATE_COMPONENTS },
    ],
  },
] as const

const asUsdc = (v: bigint): number => Number(formatUnits(v, USDC_DECIMALS))
const asToken = (v: bigint): number => Number(formatUnits(v, TOKEN_DECIMALS))

/** The subset of getMarketInfo() needed to value a wallet's position. */
export type MarketValuationInfo = {
  status: number
  yesReserve: bigint
  noReserve: bigint
  totalCollateral: bigint
  totalLpShares: bigint
  netUsdcPerYesToken: bigint
  netUsdcPerNoToken: bigint
}

/**
 * Value a wallet's EventMarket position in USDC. Pure math shared by the
 * portfolio endpoint (readMarketPosition) and the daily P&L snapshotter
 * (services/user-pnl.ts) so both mark positions to market identically:
 *
 *   - YES/NO tokens (live)    : marked to market via reserves (yesProbability).
 *   - YES/NO tokens (settled) : redeemable via netUsdcPer{Yes,No}Token.
 *   - LP position             : lpShares/totalLpShares * totalCollateral.
 */
export function valueEventMarketPosition(
  info: MarketValuationInfo,
  yesBal: bigint,
  noBal: bigint,
  lpShares: bigint,
): { yesValue: number; noValue: number; lpValue: number; totalValue: number } {
  const yesTokens = asToken(yesBal)
  const noTokens = asToken(noBal)

  let yesValue: number
  let noValue: number
  if (info.status === STATUS_SETTLED) {
    // Redeemable value once resolved: balance (USDC 1e6) * netUsdcPerToken,
    // where netUsdcPer*Token is a 1e18-scaled fraction (contract `ONE`).
    yesValue = asUsdc((yesBal * info.netUsdcPerYesToken) / RATE_SCALE)
    noValue = asUsdc((noBal * info.netUsdcPerNoToken) / RATE_SCALE)
  } else {
    // Mark to market via reserves. A YES token pays ~1 USDC if YES wins, so its
    // live fair value is the YES probability = noReserve/(yesReserve+noReserve).
    const total = info.yesReserve + info.noReserve
    const yesProb = total === 0n ? 0.5 : Number(info.noReserve) / Number(total)
    yesValue = yesTokens * yesProb
    noValue = noTokens * (1 - yesProb)
  }

  // LP value: the wallet's share of pooled collateral.
  const lpValue =
    info.totalLpShares === 0n
      ? 0
      : (Number(lpShares) / Number(info.totalLpShares)) * asUsdc(info.totalCollateral)

  return { yesValue, noValue, lpValue, totalValue: yesValue + noValue + lpValue }
}

export type PortfolioPosition = {
  chainId: number
  chainLabel: string
  address: string
  question: string
  match: string
  stage: string
  status: number
  statusLabel: string
  yesTokens: number
  noTokens: number
  yesValue: number
  noValue: number
  lpShares: number
  lpValue: number
  claimable: number
  /** Total estimated USDC value of this position (tokens + LP). */
  totalValue: number
  /** Gross USDC the wallet put into this market (buys + LP adds). */
  invested: number
  /** Profit/loss: totalValue + withdrawn − invested (can be negative). */
  pnl: number
  /**
   * Return on invested capital, percent (pnl / invested * 100). null when the
   * cost-basis ledger isn't caught up yet or the wallet invested nothing — the
   * UI hides the ROI footer in that case.
   */
  roiPct: number | null
}

export type Portfolio = {
  address: string
  totalValue: number
  positions: PortfolioPosition[]
  referral: Awaited<ReturnType<typeof getReferralSummary>>
}

async function readMarketPosition(
  client: PublicClient,
  chainId: number,
  chainLabel: string,
  market: { address: string; question: string; match: string; stage: string; deployBlock?: number },
  account: `0x${string}`,
): Promise<PortfolioPosition | null> {
  const address = getAddress(market.address)

  // One eth_call returns everything: market valuation state + the wallet's
  // balances + its cumulative USDC flows (cost basis). Markets deployed before
  // getUserState existed revert here and are skipped by getPortfolio's per-market
  // catch — no historical event scanning anywhere.
  const res = (await client.readContract({
    address,
    abi: EVENT_MARKET_ABI,
    functionName: "getUserState",
    args: [account],
  })) as unknown
  // viem returns multiple named outputs as a positional tuple; fall back to an
  // object shape defensively.
  const [info, pos] = Array.isArray(res)
    ? (res as [any, any])
    : [(res as any).info, (res as any).pos]

  const yesBal = BigInt(pos.yesBalance ?? 0n)
  const noBal = BigInt(pos.noBalance ?? 0n)
  const lpSharesRaw = BigInt(pos.lpShares ?? 0n)

  // Skip markets the wallet has no stake in.
  if (yesBal === 0n && noBal === 0n && lpSharesRaw === 0n) return null

  const status = Number(info.status ?? 0)

  const yesTokens = asToken(yesBal)
  const noTokens = asToken(noBal)

  const { yesValue, noValue, lpValue } = valueEventMarketPosition(
    {
      status,
      yesReserve: BigInt(info.yesReserve ?? 0n),
      noReserve: BigInt(info.noReserve ?? 0n),
      totalCollateral: BigInt(info.totalCollateral ?? 0n),
      totalLpShares: BigInt(info.totalLpShares ?? 0n),
      netUsdcPerYesToken: BigInt(info.netUsdcPerYesToken ?? 0n),
      netUsdcPerNoToken: BigInt(info.netUsdcPerNoToken ?? 0n),
    },
    yesBal,
    noBal,
    lpSharesRaw,
  )

  const lpSharesNum = asUsdc(lpSharesRaw)
  const lpClaimed = Boolean(pos.lpClaimed)

  // Claimable: redeemable token value now, plus an unclaimed LP payout estimate
  // once the market is settled.
  const tokenClaimable = yesValue + noValue
  const claimable =
    status === STATUS_SETTLED ? tokenClaimable + (lpClaimed ? 0 : lpValue) : 0

  const totalValue = yesValue + noValue + lpValue

  // Cost basis + ROI straight from on-chain cumulative flows — always current.
  const invested = asUsdc(BigInt(pos.usdcIn ?? 0n))
  const withdrawn = asUsdc(BigInt(pos.usdcOut ?? 0n))
  // pnl = current value + USDC already taken out − USDC put in.
  const pnl = totalValue + withdrawn - invested
  const roiPct = invested > 0 ? (pnl / invested) * 100 : null

  return {
    chainId,
    chainLabel,
    address,
    question: String(info.question ?? market.question ?? ""),
    match: market.match ?? "",
    stage: market.stage ?? "",
    status,
    statusLabel: STATUS_LABELS[status] ?? "Unknown",
    yesTokens,
    noTokens,
    yesValue,
    noValue,
    lpShares: lpSharesNum,
    lpValue,
    claimable,
    totalValue,
    invested,
    pnl,
    roiPct,
  }
}

/**
 * Aggregate a wallet's positions across every EventMarket in every supported
 * chain in the deployment registry. RPC failures on one chain/market are logged
 * and skipped so the rest of the portfolio still resolves.
 */
export async function getPortfolio(rawAddress: string): Promise<Portfolio> {
  const account = getAddress(rawAddress)
  const positions: PortfolioPosition[] = []
  const referralPromise = getReferralSummary(account)

  for (const chain of deployments) {
    if (!isSupportedChain(chain.chainId)) continue
    const markets = chain.markets.filter((m) => m.address && m.address.trim() !== "")
    if (markets.length === 0) continue

    let client: PublicClient
    try {
      client = getPublicClient(chain.chainId)
    } catch (err) {
      console.warn(`[portfolio] no client for chain ${chain.chainId}:`, err instanceof Error ? err.message : err)
      continue
    }

    const results = await Promise.all(
      markets.map((m) =>
        readMarketPosition(client, chain.chainId, chain.label, m, account).catch((err) => {
          console.warn(`[portfolio] read failed for ${m.address} (chain ${chain.chainId}):`, err instanceof Error ? err.message : err)
          return null
        }),
      ),
    )
    for (const r of results) if (r) positions.push(r)
  }

  const totalValue = positions.reduce((sum, p) => sum + p.totalValue, 0)
  const referral = await referralPromise
  return { address: account, totalValue, positions, referral }
}
