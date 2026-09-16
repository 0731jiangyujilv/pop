/**
 * EventMarket (YES/NO AMM) statistics.
 *
 * Markets maintain their own cumulative statistics on-chain (volumes, counts,
 * unique participants) and expose them via `getMarketState() -> (MarketInfo,
 * Stats)`. Collecting them is therefore ONE eth_call per market per poll:
 *
 *   1. read getMarketState()             — live state + cumulative counters
 *   2. diff against the last hourly row  — activity since the previous poll
 *   3. write four tables:
 *        event_market_hourly_snapshots  raw cumulative reading (the record)
 *        event_market_stats             current totals, absolute (no increments)
 *        event_market_daily_snapshots   += the delta, which is what
 *                                       /api/event-market/daily-snapshots and
 *                                       the stats page read
 *        pool_probability_points        the odds point behind the /fed, /crypto
 *                                       and /midterm charts
 *
 * Why diff instead of storing per-day buckets on-chain: the counters are
 * monotonic, so any period's activity is a subtraction. That keeps the contract
 * free of per-day mappings and keeps a trade's extra cost at ~2 SSTOREs.
 *
 * Two consequences of the diffing model, both deliberate:
 *   • A delta is attributed to the UTC day of the PREVIOUS reading, since that
 *     is when the activity happened. Day attribution is therefore accurate to
 *     within one poll interval.
 *   • Daily uniqueTraders/uniqueLps mean NEW participants that day rather than
 *     participants active that day — a cumulative unique count cannot express
 *     the latter.
 *
 * Legacy markets: markets deployed before the counters existed revert on
 * getMarketState(). They are deprecated, so they are simply skipped — nothing
 * re-derives their numbers from logs any more. Their historical rows in
 * event_market_stats / event_market_daily_snapshots / event_market_participants
 * are left untouched and the API keeps serving them; those rows are just frozen
 * at whatever the final log scan recorded.
 *
 * Read-of-chain + write of our own stats; never moves funds, not a settler.
 */
import { createRpcRetry, isRetryableRpcError } from "@polypop/rpc"
import { formatUnits, getAddress, type Address, type PublicClient } from "viem"
import { prisma } from "../db"
import { getPublicClient, isSupportedChain, SUPPORTED_CHAINS } from "../chains"

const USDC_DECIMALS = 6
const BPS = 10_000n

const usdc = (v: bigint): number => Number(formatUnits(v, USDC_DECIMALS))

// EventMarket.getMarketState() — MarketInfo + Stats in a single call. Keep in
// sync with contracts/src/interfaces/IEventMarket.sol.
const GET_MARKET_STATE_ABI = [
  {
    type: "function",
    name: "getMarketState",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "info",
        type: "tuple",
        components: [
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
        ],
      },
      {
        name: "stats",
        type: "tuple",
        components: [
          { name: "buyYesVolume", type: "uint128" },
          { name: "buyNoVolume", type: "uint128" },
          { name: "sellYesVolume", type: "uint128" },
          { name: "sellNoVolume", type: "uint128" },
          { name: "liquidityAdded", type: "uint128" },
          { name: "liquidityRemoved", type: "uint128" },
          { name: "pairRedeemVolume", type: "uint128" },
          { name: "redeemPayout", type: "uint128" },
          { name: "lpClaimPayout", type: "uint128" },
          { name: "platformFee", type: "uint128" },
          { name: "creatorFee", type: "uint128" },
          { name: "buyYesCount", type: "uint32" },
          { name: "buyNoCount", type: "uint32" },
          { name: "sellYesCount", type: "uint32" },
          { name: "sellNoCount", type: "uint32" },
          { name: "liquidityAddedCount", type: "uint32" },
          { name: "liquidityRemovedCount", type: "uint32" },
          { name: "uniqueTraders", type: "uint32" },
          { name: "uniqueLps", type: "uint32" },
          { name: "pairRedeemCount", type: "uint32" },
          { name: "redeemCount", type: "uint32" },
          { name: "lpClaimCount", type: "uint32" },
        ],
      },
    ],
  },
] as const

/**
 * Flatten an RPC/viem error into one diagnosable line. viem nests the useful
 * part (HTTP status, JSON-RPC code, node message) several `cause` levels down
 * and pads the top-level `message` with a multi-line request dump, so log the
 * whole chain compactly instead of a bare "transient RPC error".
 */
export function describeError(error: unknown): string {
  const parts: string[] = []
  const add = (v: string) => {
    const line = v.split("\n")[0]?.trim()
    if (line && !parts.includes(line)) parts.push(line)
  }

  let current: unknown = error
  for (let depth = 0; current && depth < 8; depth++) {
    if (typeof current !== "object") {
      add(String(current))
      break
    }
    const record = current as Record<string, unknown>
    for (const key of ["shortMessage", "details", "message"] as const) {
      if (typeof record[key] === "string") add(record[key] as string)
    }
    const status = record.status ?? record.statusCode
    if (typeof status === "number") add(`HTTP ${status}`)
    if (typeof record.code === "number" || typeof record.code === "string") add(`code ${record.code}`)
    if (typeof record.url === "string") add(record.url as string)
    current = record.cause
  }

  return parts.length > 0 ? parts.join(" | ") : String(error)
}

const withRpcRetry = createRpcRetry("event-market-stats")

/**
 * A call to a function the deployed bytecode doesn't have returns empty data
 * rather than reverting with a reason — that (or a bare revert) is how a
 * pre-counters market answers getMarketState(). Network/rate-limit failures
 * look different and must not be mistaken for "legacy".
 */
function isUnsupportedFunctionError(error: unknown): boolean {
  if (isRetryableRpcError(error)) return false
  const text = String(
    (error as { shortMessage?: string; message?: string })?.shortMessage ??
      (error as { message?: string })?.message ??
      error,
  )
  return /returned no data|execution reverted|function .* reverted|does not exist|ContractFunctionZeroData/i.test(text)
}

/** UTC start-of-day for a timestamp. */
function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** UTC start-of-hour bucket for a timestamp. */
function utcHour(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours()))
}

function unixToDate(raw: unknown): Date | null {
  const n = Number(raw ?? 0)
  if (!n || !Number.isFinite(n)) return null
  return new Date(n * 1000)
}

/** Deltas are never negative: the counters are monotonic, so clamp defensively. */
function delta(now: number, prev: number): number {
  const d = now - prev
  return d > 0 ? d : 0
}

/**
 * 0..1 probability -> the 0..100 percent with 2 decimals that
 * pool_probability_points stores (matches the chart's expected scale).
 */
function toPct(probability: number): number {
  return Math.min(100, Math.max(0, Math.round(probability * 10_000) / 100))
}

export type PollSummary = {
  chainId: number
  contractAddress: string
  /** UTC day the delta was attributed to, "YYYY-MM-DD". */
  day: string
  /** Cumulative totals after this poll. */
  totalVolume: number
  tradeCount: number
  uniqueTraders: number
  uniqueLps: number
  platformFee: number
  creatorFee: number
  totalCollateral: number
  /** Activity since the previous poll (0 on the first poll of a fresh market). */
  deltaVolume: number
  deltaTrades: number
  /** True when this was the market's first poll (no prior hourly row). */
  firstPoll: boolean
}

/**
 * Raised for a market deployed before the on-chain counters existed. Those
 * markets are deprecated: callers skip them and leave their stored history as
 * it is.
 */
export class LegacyMarketError extends Error {
  constructor(address: string) {
    super(`${address} predates on-chain statistics (no getMarketState) — skipped`)
    this.name = "LegacyMarketError"
  }
}

/** Probe whether a market maintains its own statistics (diagnostics / scripts). */
export async function supportsOnchainStats(chainId: number, address: string): Promise<boolean> {
  if (!isSupportedChain(chainId)) throw new Error(`Unsupported chain: ${chainId}`)
  const client = getPublicClient(chainId) as PublicClient
  try {
    await readMarketState(client, getAddress(address), chainId)
    return true
  } catch (error) {
    if (isUnsupportedFunctionError(error)) return false
    throw error
  }
}

async function readMarketState(client: PublicClient, address: Address, chainId: number) {
  // Label carries the market and chain: with several markets polled in a row,
  // a retry line has to say which one is struggling.
  const result = (await withRpcRetry(`getMarketState ${address} (chain ${chainId})`, () =>
    client.readContract({ address, abi: GET_MARKET_STATE_ABI, functionName: "getMarketState" } as any),
  )) as any
  // viem returns a 2-tuple of structs for a multi-output view.
  const [info, stats] = result as [any, any]
  return { info, stats }
}

export type PollOptions = {
  /** Chain head at poll time; recorded on the hourly row. Fetch once per chain. */
  blockNumber?: bigint
  /**
   * Step tracer. Called with a `step` key and the data involved, so the caller
   * decides how (and whether) to print. Steps are emitted as `write:<table>`
   * immediately BEFORE each insert/upsert and `ok:<table>` right after, so a
   * throw pins the exact statement that failed rather than leaving a half-
   * written market to guess about.
   */
  debug?: (step: string, data?: unknown) => void
}

/**
 * Poll one market's on-chain counters and persist the reading plus the derived
 * deltas. Throws {@link LegacyMarketError} if the market predates them.
 */
export async function pollEventMarketStats(
  chainId: number,
  address: string,
  opts: PollOptions = {},
): Promise<PollSummary> {
  if (!isSupportedChain(chainId)) throw new Error(`Unsupported chain: ${chainId}`)
  const contractAddress = getAddress(address)
  const client = getPublicClient(chainId) as PublicClient
  const trace = opts.debug ?? (() => {})

  trace("start", { chainId, contractAddress, blockNumber: opts.blockNumber })

  let info: any
  let stats: any
  try {
    ;({ info, stats } = await readMarketState(client, contractAddress, chainId))
  } catch (error) {
    if (isUnsupportedFunctionError(error)) throw new LegacyMarketError(contractAddress)
    // Retries are already exhausted here, so carry the flattened cause into the
    // thrown message — the caller only prints error.message.
    throw new Error(`getMarketState ${contractAddress} (chain ${chainId}) failed: ${describeError(error)}`, { cause: error })
  }

  const now = new Date()

  // ── Current cumulative reading, in USDC units ────────────────────────────
  const cur = {
    buyYesVolume: usdc(BigInt(stats.buyYesVolume ?? 0n)),
    buyNoVolume: usdc(BigInt(stats.buyNoVolume ?? 0n)),
    sellYesVolume: usdc(BigInt(stats.sellYesVolume ?? 0n)),
    sellNoVolume: usdc(BigInt(stats.sellNoVolume ?? 0n)),
    liquidityAdded: usdc(BigInt(stats.liquidityAdded ?? 0n)),
    liquidityRemoved: usdc(BigInt(stats.liquidityRemoved ?? 0n)),
    pairRedeemVolume: usdc(BigInt(stats.pairRedeemVolume ?? 0n)),
    redeemPayout: usdc(BigInt(stats.redeemPayout ?? 0n)),
    lpClaimPayout: usdc(BigInt(stats.lpClaimPayout ?? 0n)),
    platformFee: usdc(BigInt(stats.platformFee ?? 0n)),
    creatorFee: usdc(BigInt(stats.creatorFee ?? 0n)),
    buyYesCount: Number(stats.buyYesCount ?? 0),
    buyNoCount: Number(stats.buyNoCount ?? 0),
    sellYesCount: Number(stats.sellYesCount ?? 0),
    sellNoCount: Number(stats.sellNoCount ?? 0),
    liquidityAddedCount: Number(stats.liquidityAddedCount ?? 0),
    liquidityRemovedCount: Number(stats.liquidityRemovedCount ?? 0),
    uniqueTraders: Number(stats.uniqueTraders ?? 0),
    uniqueLps: Number(stats.uniqueLps ?? 0),
    pairRedeemCount: Number(stats.pairRedeemCount ?? 0),
    redeemCount: Number(stats.redeemCount ?? 0),
    lpClaimCount: Number(stats.lpClaimCount ?? 0),
  }

  const totalCollateral = BigInt(info.totalCollateral ?? 0n)
  const yesReserve = BigInt(info.yesReserve ?? 0n)
  const noReserve = BigInt(info.noReserve ?? 0n)
  const isDraw = Boolean(info.isDraw)
  const yesProbability =
    yesReserve + noReserve === 0n ? 0.5 : Number(noReserve) / Number(yesReserve + noReserve)

  const totalVolume = cur.buyYesVolume + cur.buyNoVolume + cur.sellYesVolume + cur.sellNoVolume
  const tradeCount = cur.buyYesCount + cur.buyNoCount + cur.sellYesCount + cur.sellNoCount

  trace("read:info", {
    question: String(info.question ?? ""),
    status: Number(info.status ?? 0),
    yesWins: Boolean(info.yesWins),
    isDraw,
    yesReserve: usdc(yesReserve),
    noReserve: usdc(noReserve),
    totalCollateral: usdc(totalCollateral),
    totalLpShares: usdc(BigInt(info.totalLpShares ?? 0n)),
    platformFeeBps: Number(info.platformFeeBps ?? 0n),
    creatorFeeBps: Number(info.creatorFeeBps ?? 0n),
  })
  trace("read:stats", cur)
  trace("derive", {
    totalVolume,
    tradeCount,
    yesProbability,
    yesProbabilityPct: toPct(yesProbability),
  })

  // Fees: the contract records the real amounts at resolve. Before settlement
  // there are none yet, so report the projection, and zero for an emergency
  // draw (that path charges no protocol fee).
  const settled = cur.platformFee > 0 || cur.creatorFee > 0
  const platformFee = settled
    ? cur.platformFee
    : isDraw
      ? 0
      : usdc((totalCollateral * BigInt(info.platformFeeBps ?? 0n)) / BPS)
  const creatorFee = settled
    ? cur.creatorFee
    : isDraw
      ? 0
      : usdc((totalCollateral * BigInt(info.creatorFeeBps ?? 0n)) / BPS)

  // ── Diff against the previous reading ────────────────────────────────────
  const prevRow = await prisma.eventMarketHourlySnapshot.findFirst({
    where: { chainId, contractAddress },
    orderBy: { hour: "desc" },
  })

  const prev = prevRow
    ? {
        buyYesVolume: Number(prevRow.buyYesVolume),
        buyNoVolume: Number(prevRow.buyNoVolume),
        sellYesVolume: Number(prevRow.sellYesVolume),
        sellNoVolume: Number(prevRow.sellNoVolume),
        buyYesCount: prevRow.buyYesCount,
        buyNoCount: prevRow.buyNoCount,
        sellYesCount: prevRow.sellYesCount,
        sellNoCount: prevRow.sellNoCount,
        uniqueTraders: prevRow.uniqueTraders,
        uniqueLps: prevRow.uniqueLps,
      }
    : null

  const dayDeltas = {
    buyYesVolume: delta(cur.buyYesVolume, prev?.buyYesVolume ?? 0),
    buyNoVolume: delta(cur.buyNoVolume, prev?.buyNoVolume ?? 0),
    sellYesVolume: delta(cur.sellYesVolume, prev?.sellYesVolume ?? 0),
    sellNoVolume: delta(cur.sellNoVolume, prev?.sellNoVolume ?? 0),
    tradeCount:
      delta(cur.buyYesCount, prev?.buyYesCount ?? 0) +
      delta(cur.buyNoCount, prev?.buyNoCount ?? 0) +
      delta(cur.sellYesCount, prev?.sellYesCount ?? 0) +
      delta(cur.sellNoCount, prev?.sellNoCount ?? 0),
    uniqueTraders: delta(cur.uniqueTraders, prev?.uniqueTraders ?? 0),
    uniqueLps: delta(cur.uniqueLps, prev?.uniqueLps ?? 0),
  }
  const deltaVolume =
    dayDeltas.buyYesVolume + dayDeltas.buyNoVolume + dayDeltas.sellYesVolume + dayDeltas.sellNoVolume

  // The activity happened between the previous reading and now, so it belongs to
  // the previous reading's UTC day — which keeps a poll at 00:0x from pushing the
  // tail of yesterday into today. Attribution is exact to within one poll
  // interval; if the poller was down for longer, everything it missed lands on
  // the day of the last successful reading.
  const attributionDay = utcDay(prevRow?.capturedAt ?? now)

  trace("prev:event_market_hourly_snapshots", prevRow
    ? { hour: prevRow.hour, capturedAt: prevRow.capturedAt, ...prev }
    : "none — first poll for this market")
  trace("derive:deltas", {
    ...dayDeltas,
    deltaVolume,
    attributionDay: attributionDay.toISOString().slice(0, 10),
    platformFee,
    creatorFee,
    settled,
  })

  // ── Persist: current totals ──────────────────────────────────────────────
  // Absolute writes, not increments — the chain is the source of truth, so a
  // repeated or out-of-order poll converges instead of double-counting.
  const currentState = {
    question: String(info.question ?? ""),
    resolutionSource: String(info.resolutionSource ?? ""),
    bettingDeadline: unixToDate(info.bettingDeadline),
    resolveAfter: unixToDate(info.resolveAfter),
    status: Number(info.status ?? 0),
    yesWins: Boolean(info.yesWins),
    isDraw,
    yesReserve: usdc(yesReserve),
    noReserve: usdc(noReserve),
    totalCollateral: usdc(totalCollateral),
    totalLpShares: usdc(BigInt(info.totalLpShares ?? 0n)),
    yesProbability,

    buyYesCount: cur.buyYesCount,
    buyNoCount: cur.buyNoCount,
    sellYesCount: cur.sellYesCount,
    sellNoCount: cur.sellNoCount,
    buyYesVolume: cur.buyYesVolume,
    buyNoVolume: cur.buyNoVolume,
    sellYesVolume: cur.sellYesVolume,
    sellNoVolume: cur.sellNoVolume,
    totalVolume,
    tradeCount,
    uniqueTraders: cur.uniqueTraders,

    liquidityAddedCount: cur.liquidityAddedCount,
    liquidityRemovedCount: cur.liquidityRemovedCount,
    totalLiquidityAdded: cur.liquidityAdded,
    totalLiquidityRemoved: cur.liquidityRemoved,
    uniqueLps: cur.uniqueLps,

    pairRedeemCount: cur.pairRedeemCount,
    pairRedeemVolume: cur.pairRedeemVolume,
    redeemCount: cur.redeemCount,
    redeemPayout: cur.redeemPayout,
    lpClaimCount: cur.lpClaimCount,
    lpClaimPayout: cur.lpClaimPayout,
    platformFee,
    creatorFee,

    scannedAt: now,
    ...(opts.blockNumber !== undefined ? { lastScannedBlock: opts.blockNumber } : {}),
  }

  trace("write:event_market_stats", currentState)
  await prisma.eventMarketStat.upsert({
    where: { chainId_contractAddress: { chainId, contractAddress } },
    update: currentState,
    create: { chainId, contractAddress, ...currentState },
  })
  trace("ok:event_market_stats")

  // ── Persist: this hour's raw reading ─────────────────────────────────────
  const hourly = {
    capturedAt: now,
    blockNumber: opts.blockNumber ?? 0n,
    status: Number(info.status ?? 0),
    totalCollateral: usdc(totalCollateral),
    yesReserve: usdc(yesReserve),
    noReserve: usdc(noReserve),
    totalLpShares: usdc(BigInt(info.totalLpShares ?? 0n)),
    yesProbability,
    ...cur,
  }

  trace("write:event_market_hourly_snapshots", { hour: utcHour(now), ...hourly })
  await prisma.eventMarketHourlySnapshot.upsert({
    where: {
      chainId_contractAddress_hour: { chainId, contractAddress, hour: utcHour(now) },
    },
    update: hourly,
    create: { chainId, contractAddress, hour: utcHour(now), ...hourly },
  })
  trace("ok:event_market_hourly_snapshots")

  // ── Persist: the odds point the /fed, /crypto, /midterm charts read ──────
  // Same reading, finer-grained table: the hourly row is bucketed (one per hour,
  // overwritten) whereas the charts want every sample kept, so the poll cadence
  // is the chart's resolution. Appended here rather than by a second worker so
  // the sampled set stays exactly config/event-market-deployments.ts and there
  // is no second copy of the addresses to keep in sync.
  const probabilityPoint = { chainId, contractAddress, yesProbability: toPct(yesProbability) }
  trace("write:pool_probability_points", probabilityPoint)
  const writtenPoint = await prisma.poolProbabilityPoint.create({ data: probabilityPoint })
  trace("ok:pool_probability_points", { id: writtenPoint.id, capturedAt: writtenPoint.capturedAt })

  // ── Persist: fold the delta into the attributed UTC day ──────────────────
  // Flows accumulate; TVL and the fee projection are point-in-time, so they are
  // overwritten. Skipped entirely on the first poll of a market that already has
  // history, whose "delta" would be its whole lifetime dumped onto one day.
  const isBackfill = !prevRow && (totalVolume > 0 || cur.liquidityAddedCount > 1)
  const hasDayActivity = deltaVolume > 0 || dayDeltas.tradeCount > 0 || dayDeltas.uniqueLps > 0
  if (isBackfill || !hasDayActivity) {
    trace("skip:event_market_daily_snapshots", {
      reason: isBackfill
        ? "first poll of a market that already has history — its whole lifetime would land on one day"
        : "no activity since the previous reading",
      isBackfill,
      hasDayActivity,
      date: attributionDay.toISOString().slice(0, 10),
    })
  }
  if (!isBackfill && hasDayActivity) {
    trace("write:event_market_daily_snapshots", {
      date: attributionDay.toISOString().slice(0, 10),
      increments: {
        totalVolume: deltaVolume,
        tradeCount: dayDeltas.tradeCount,
        uniqueTraders: dayDeltas.uniqueTraders,
        uniqueLps: dayDeltas.uniqueLps,
        buyYesVolume: dayDeltas.buyYesVolume,
        buyNoVolume: dayDeltas.buyNoVolume,
        sellYesVolume: dayDeltas.sellYesVolume,
        sellNoVolume: dayDeltas.sellNoVolume,
      },
      overwrites: { totalCollateral: usdc(totalCollateral), platformFee, creatorFee },
    })
    await prisma.eventMarketDailySnapshot.upsert({
      where: { chainId_contractAddress_date: { chainId, contractAddress, date: attributionDay } },
      update: {
        totalVolume: { increment: deltaVolume },
        tradeCount: { increment: dayDeltas.tradeCount },
        totalCollateral: usdc(totalCollateral),
        uniqueTraders: { increment: dayDeltas.uniqueTraders },
        uniqueLps: { increment: dayDeltas.uniqueLps },
        buyYesVolume: { increment: dayDeltas.buyYesVolume },
        buyNoVolume: { increment: dayDeltas.buyNoVolume },
        sellYesVolume: { increment: dayDeltas.sellYesVolume },
        sellNoVolume: { increment: dayDeltas.sellNoVolume },
        platformFee,
        creatorFee,
      },
      create: {
        chainId,
        contractAddress,
        date: attributionDay,
        totalVolume: deltaVolume,
        tradeCount: dayDeltas.tradeCount,
        totalCollateral: usdc(totalCollateral),
        uniqueTraders: dayDeltas.uniqueTraders,
        uniqueLps: dayDeltas.uniqueLps,
        buyYesVolume: dayDeltas.buyYesVolume,
        buyNoVolume: dayDeltas.buyNoVolume,
        sellYesVolume: dayDeltas.sellYesVolume,
        sellNoVolume: dayDeltas.sellNoVolume,
        platformFee,
        creatorFee,
      },
    })
    trace("ok:event_market_daily_snapshots")
  }

  trace("done", { chainId, contractAddress })

  return {
    chainId,
    contractAddress,
    day: attributionDay.toISOString().slice(0, 10),
    totalVolume,
    tradeCount,
    uniqueTraders: cur.uniqueTraders,
    uniqueLps: cur.uniqueLps,
    platformFee,
    creatorFee,
    totalCollateral: usdc(totalCollateral),
    deltaVolume: isBackfill ? 0 : deltaVolume,
    deltaTrades: isBackfill ? 0 : dayDeltas.tradeCount,
    firstPoll: !prevRow,
  }
}

// ---------- Scheduled worker ----------

// Hourly by default: one call per market per interval, and the interval doubles
// as the accuracy of UTC-day attribution in the daily snapshots.
const STATS_INTERVAL_MS =
  Number(process.env.EVENT_MARKET_STATS_INTERVAL_MS) > 0
    ? Number(process.env.EVENT_MARKET_STATS_INTERVAL_MS)
    : 60 * 60_000

/** Parse EVENT_MARKET_STATS_TARGETS: "chainId:0xAddr,chainId:0xAddr". */
function parseTargets(raw: string | undefined): Array<{ chainId: number; address: string }> {
  if (!raw) return []
  const out: Array<{ chainId: number; address: string }> = []
  for (const part of raw.split(",")) {
    const [cidRaw, addrRaw] = part.split(":").map((s) => s.trim())
    const chainId = Number(cidRaw)
    if (!cidRaw || !addrRaw || Number.isNaN(chainId) || !isSupportedChain(chainId)) {
      console.warn(`[event-market-stats] skipping invalid target "${part}"`)
      continue
    }
    try {
      out.push({ chainId, address: getAddress(addrRaw) })
    } catch {
      console.warn(`[event-market-stats] skipping invalid address in target "${part}"`)
    }
  }
  return out
}

/** Union of env seed targets and markets already in the stats table. */
export async function resolveWorkerTargets(): Promise<Array<{ chainId: number; address: string }>> {
  const seeds = parseTargets(process.env.EVENT_MARKET_STATS_TARGETS)
  const rows = await prisma.eventMarketStat.findMany({ select: { chainId: true, contractAddress: true } })
  const map = new Map<string, { chainId: number; address: string }>()
  for (const t of seeds) map.set(`${t.chainId}:${t.address.toLowerCase()}`, t)
  for (const r of rows) {
    const address = getAddress(r.contractAddress)
    map.set(`${r.chainId}:${address.toLowerCase()}`, { chainId: r.chainId, address })
  }
  return [...map.values()]
}

/**
 * Single-instance polling worker. Polls every known market on an interval.
 * Deprecated markets without on-chain counters are skipped (their stored stats
 * stay frozen). Read-only aggregator — not a settler, so no worker-lease needed.
 */
export async function startEventMarketStatsWorker(): Promise<void> {
  const chains = Object.keys(SUPPORTED_CHAINS).join(", ")
  console.log(`[event-market-stats] worker starting (interval ${STATS_INTERVAL_MS}ms, chains ${chains})`)

  const run = async () => {
    const targets = await resolveWorkerTargets()
    if (targets.length === 0) {
      console.log("[event-market-stats] no targets yet (seed via EVENT_MARKET_STATS_TARGETS or the poll script)")
      return
    }
    for (const { chainId, address } of targets) {
      try {
        const s = await pollEventMarketStats(chainId, address)
        console.log(`[event-market-stats] ${address} (chain ${chainId}): trades=${s.tradeCount} (+${s.deltaTrades}), vol=${s.totalVolume.toFixed(2)} USDC (+${s.deltaVolume.toFixed(2)})`)
      } catch (error) {
        if (error instanceof LegacyMarketError) {
          console.log(`[event-market-stats] ${address} (chain ${chainId}): legacy market, skipped (stored stats frozen)`)
          continue
        }
        console.error(`[event-market-stats] ${address} (chain ${chainId}) failed: ${describeError(error)}`)
      }
    }
  }

  await run()
  setInterval(() => { void run() }, STATS_INTERVAL_MS)
}
