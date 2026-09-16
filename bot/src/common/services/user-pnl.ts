/**
 * Daily user P&L snapshotter + history reader.
 *
 * Once a day this scans every EventMarket (YES/NO AMM) in the deployment
 * registry across all supported chains, derives each participating wallet's
 * *net USDC invested* from the on-chain trade/LP/redeem events, reads the
 * wallet's current holdings to mark its live/settled position to market, and
 * stores the resulting cumulative net P&L as one `UserPnlDailySnapshot` row per
 * (address, UTC-day).
 *
 *   pnl = positionValue − netInvested
 *
 *   netInvested   = usdcIn − usdcOut
 *     usdcIn  = BoughtYes + BoughtNo + LiquidityAdded            (USDC put in)
 *     usdcOut = SoldYes + SoldNo + LiquidityRemoved + Redeemed
 *             + PairRedeemed + LpPayoutClaimed                   (USDC taken out)
 *   positionValue = mark-to-market value of held YES/NO tokens + LP share,
 *                   via valueEventMarketPosition() (shared with the portfolio
 *                   endpoint so both value positions identically).
 *
 * This makes LIVE markets count (mark-to-market), a settled *wrong* bet a loss
 * (positionValue 0, pnl = −netInvested), and a claimed win a realized profit
 * (positionValue 0 but usdcOut > usdcIn). Forward-only: one point per day going
 * forward, no historical price backfill.
 *
 * Two halves (mirrors services/champion-pool-probability.ts):
 *   • snapshotUserPnl()   — the daily batch (worker + manual script).
 *   • getUserPnlHistory() — read a wallet's series back for the portfolio page.
 *
 * Read-of-chain + write of our own stats; never moves funds, not a settler.
 */
import { createRpcRetry } from "@polypop/rpc"
import { formatUnits, getAddress, type Address, type PublicClient } from "viem"
import { prisma } from "../db"
import { getPublicClient, isSupportedChain } from "../chains"
import { valueEventMarketPosition } from "./portfolio"
// Data-only JSON mirror of config/event-market-deployments.ts — importing the
// .ts source would trip tsc's rootDir check (same pattern as portfolio.ts).
import deploymentsJson from "../../../config/event-market-deployments.json"

type MarketEntry = { address: string; deployBlock?: number }
type ChainEntry = { chainId: number; slug: string; label: string; markets: MarketEntry[] }
const deployments = deploymentsJson as ChainEntry[]

const USDC_DECIMALS = 6
const asUsdc = (v: bigint): number => Number(formatUnits(v, USDC_DECIMALS))

// Public RPCs commonly cap eth_getLogs at 500 blocks; keep below the lowest.
const MAX_BLOCK_RANGE = BigInt(
  Number(process.env.USER_PNL_BLOCK_RANGE) > 0 ? Number(process.env.USER_PNL_BLOCK_RANGE) : 500,
)
// How many wallets' balances to read concurrently per market.
const BALANCE_CONCURRENCY = 8


// Events we read to attribute per-wallet USDC flows (subset of IEventMarket,
// same definitions as services/event-market-stats.ts). Exported for reuse.
export const EVENT_MARKET_EVENTS_ABI = [
  { type: "event", name: "BoughtYes", inputs: [
    { name: "buyer", type: "address", indexed: true },
    { name: "usdcIn", type: "uint256", indexed: false },
    { name: "yesOut", type: "uint256", indexed: false },
  ] },
  { type: "event", name: "BoughtNo", inputs: [
    { name: "buyer", type: "address", indexed: true },
    { name: "usdcIn", type: "uint256", indexed: false },
    { name: "noOut", type: "uint256", indexed: false },
  ] },
  { type: "event", name: "SoldYes", inputs: [
    { name: "seller", type: "address", indexed: true },
    { name: "yesIn", type: "uint256", indexed: false },
    { name: "usdcOut", type: "uint256", indexed: false },
  ] },
  { type: "event", name: "SoldNo", inputs: [
    { name: "seller", type: "address", indexed: true },
    { name: "noIn", type: "uint256", indexed: false },
    { name: "usdcOut", type: "uint256", indexed: false },
  ] },
  { type: "event", name: "LiquidityAdded", inputs: [
    { name: "provider", type: "address", indexed: true },
    { name: "usdcAmount", type: "uint256", indexed: false },
    { name: "shares", type: "uint256", indexed: false },
    { name: "locked", type: "bool", indexed: false },
  ] },
  { type: "event", name: "LiquidityRemoved", inputs: [
    { name: "provider", type: "address", indexed: true },
    { name: "sharesBurned", type: "uint256", indexed: false },
    { name: "usdcOut", type: "uint256", indexed: false },
    { name: "yesOut", type: "uint256", indexed: false },
    { name: "noOut", type: "uint256", indexed: false },
  ] },
  { type: "event", name: "PairRedeemed", inputs: [
    { name: "user", type: "address", indexed: true },
    { name: "amount", type: "uint256", indexed: false },
  ] },
  { type: "event", name: "Redeemed", inputs: [
    { name: "user", type: "address", indexed: true },
    { name: "tokenAmount", type: "uint256", indexed: false },
    { name: "usdcOut", type: "uint256", indexed: false },
    { name: "isYes", type: "bool", indexed: false },
  ] },
  { type: "event", name: "LpPayoutClaimed", inputs: [
    { name: "lp", type: "address", indexed: true },
    { name: "usdcOut", type: "uint256", indexed: false },
  ] },
] as const

// Views we read for the current on-chain snapshot: market info + balances.
const EVENT_MARKET_READ_ABI = [
  {
    type: "function",
    name: "getMarketInfo",
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
    ],
  },
  { type: "function", name: "yesBalanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "noBalanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "lpShares", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
] as const

/** UTC start-of-day for a given date (defaults to now). */
function utcDay(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export const withRpcRetry = createRpcRetry("user-pnl", { retries: 5 })

/** Run `fn` over `items` with bounded concurrency. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

/** Per-wallet USDC flows accumulated over one market's full event history. */
type Flow = { inRaw: bigint; outRaw: bigint }

/**
 * Scan a single market's full event history and return each participant's net
 * USDC flows (keyed by checksummed address).
 */
async function scanMarketFlows(
  client: PublicClient,
  address: Address,
  deployBlock: bigint,
  label: string,
): Promise<Map<string, Flow>> {
  const flows = new Map<string, Flow>()
  const add = (raw: string, inRaw: bigint, outRaw: bigint) => {
    const key = getAddress(raw)
    const f = flows.get(key) ?? { inRaw: 0n, outRaw: 0n }
    f.inRaw += inRaw
    f.outRaw += outRaw
    flows.set(key, f)
  }

  const currentBlock = await withRpcRetry("getBlockNumber", () => client.getBlockNumber())
  const span = currentBlock >= deployBlock ? currentBlock - deployBlock + 1n : 0n
  const totalChunks = span === 0n ? 0 : Number((span + MAX_BLOCK_RANGE - 1n) / MAX_BLOCK_RANGE)
  console.log(
    `[user-pnl] ${label} scanning blocks ${deployBlock}..${currentBlock} (${totalChunks} chunk(s) of ${MAX_BLOCK_RANGE})`,
  )

  let chunkStart = deployBlock
  let chunk = 0
  let logCount = 0
  while (chunkStart <= currentBlock) {
    const chunkEnd =
      chunkStart + MAX_BLOCK_RANGE - 1n > currentBlock ? currentBlock : chunkStart + MAX_BLOCK_RANGE - 1n
    const logs = await withRpcRetry(`getLogs ${chunkStart}-${chunkEnd}`, () =>
      client.getLogs({
        address,
        events: EVENT_MARKET_EVENTS_ABI as any,
        fromBlock: chunkStart,
        toBlock: chunkEnd,
      }),
    )
    logCount += (logs as any[]).length
    chunk++
    // Heartbeat every 20 chunks (and on the last one) so long scans aren't silent.
    if (chunk % 20 === 0 || chunkEnd === currentBlock) {
      console.log(`[user-pnl] ${label} chunk ${chunk}/${totalChunks} (block ${chunkEnd}), ${logCount} log(s), ${flows.size} wallet(s)`)
    }
    for (const log of logs as any[]) {
      const a = log.args
      switch (log.eventName) {
        case "BoughtYes":
        case "BoughtNo":
          add(a.buyer, BigInt(a.usdcIn), 0n); break
        case "SoldYes":
        case "SoldNo":
          add(a.seller, 0n, BigInt(a.usdcOut)); break
        case "LiquidityAdded":
          add(a.provider, BigInt(a.usdcAmount), 0n); break
        case "LiquidityRemoved":
          add(a.provider, 0n, BigInt(a.usdcOut)); break
        case "PairRedeemed":
          add(a.user, 0n, BigInt(a.amount)); break
        case "Redeemed":
          add(a.user, 0n, BigInt(a.usdcOut)); break
        case "LpPayoutClaimed":
          add(a.lp, 0n, BigInt(a.usdcOut)); break
      }
    }
    chunkStart = chunkEnd + 1n
  }

  return flows
}

/** Aggregate of a wallet's P&L across every market + chain. */
type Agg = { netInvestedRaw: bigint; positionValue: number }

export type SnapshotSummary = { date: string; walletsWritten: number; marketsScanned: number }

/**
 * Run the daily P&L snapshot: scan every deployed EventMarket, aggregate each
 * wallet's net invested + current position value, and upsert one row per wallet
 * for today's UTC day. Returns a summary. RPC failures on a single market are
 * logged and skipped so the rest still snapshot.
 */
export async function snapshotUserPnl(now: Date = new Date()): Promise<SnapshotSummary> {
  const date = utcDay(now)
  const byWallet = new Map<string, Agg>() // key: lowercased address
  const bump = (addrLower: string, netInvestedRaw: bigint, positionValue: number) => {
    const a = byWallet.get(addrLower) ?? { netInvestedRaw: 0n, positionValue: 0 }
    a.netInvestedRaw += netInvestedRaw
    a.positionValue += positionValue
    byWallet.set(addrLower, a)
  }

  let marketsScanned = 0

  // Count the markets we'll actually touch, for progress logging.
  const totalMarkets = deployments
    .filter((c) => isSupportedChain(c.chainId))
    .reduce((n, c) => n + c.markets.filter((m) => m.address && m.address.trim() !== "").length, 0)
  console.log(`[user-pnl] snapshot starting: ${totalMarkets} market(s) across supported chains`)
  let marketIndex = 0

  for (const chain of deployments) {
    if (!isSupportedChain(chain.chainId)) continue
    const markets = chain.markets.filter((m) => m.address && m.address.trim() !== "")
    if (markets.length === 0) continue

    let client: PublicClient
    try {
      client = getPublicClient(chain.chainId) as PublicClient
    } catch (err) {
      console.warn(`[user-pnl] no client for chain ${chain.chainId}:`, err instanceof Error ? err.message : err)
      continue
    }

    for (const market of markets) {
      const address = getAddress(market.address)
      const deployBlock = BigInt(market.deployBlock ?? 0)
      marketIndex++
      const label = `[${marketIndex}/${totalMarkets}] ${address} (chain ${chain.chainId})`
      try {
        // 1. Per-wallet USDC flows from the full event history.
        const flows = await scanMarketFlows(client, address, deployBlock, label)
        if (flows.size === 0) {
          console.log(`[user-pnl] ${label}: no participants, skipping`)
          marketsScanned++
          continue
        }

        // 2. Current market snapshot (shared across all participants).
        const info = (await withRpcRetry(`getMarketInfo ${address}`, () =>
          client.readContract({ address, abi: EVENT_MARKET_READ_ABI, functionName: "getMarketInfo" } as any),
        )) as any
        const valuation = {
          status: Number(info.status ?? 0),
          yesReserve: BigInt(info.yesReserve ?? 0n),
          noReserve: BigInt(info.noReserve ?? 0n),
          totalCollateral: BigInt(info.totalCollateral ?? 0n),
          totalLpShares: BigInt(info.totalLpShares ?? 0n),
          netUsdcPerYesToken: BigInt(info.netUsdcPerYesToken ?? 0n),
          netUsdcPerNoToken: BigInt(info.netUsdcPerNoToken ?? 0n),
        }

        // 3. Read each participant's current holdings and value the position.
        const participants = [...flows.keys()]
        console.log(`[user-pnl] ${label}: reading holdings for ${participants.length} wallet(s)…`)
        let done = 0
        await mapWithConcurrency(participants, BALANCE_CONCURRENCY, async (addr) => {
          const acct = addr as Address
          const [yesBal, noBal, lpShares] = await Promise.all([
            withRpcRetry(`yesBalanceOf ${addr}`, () =>
              client.readContract({ address, abi: EVENT_MARKET_READ_ABI, functionName: "yesBalanceOf", args: [acct] }),
            ) as Promise<bigint>,
            withRpcRetry(`noBalanceOf ${addr}`, () =>
              client.readContract({ address, abi: EVENT_MARKET_READ_ABI, functionName: "noBalanceOf", args: [acct] }),
            ) as Promise<bigint>,
            withRpcRetry(`lpShares ${addr}`, () =>
              client.readContract({ address, abi: EVENT_MARKET_READ_ABI, functionName: "lpShares", args: [acct] }),
            ) as Promise<bigint>,
          ])
          const { totalValue } = valueEventMarketPosition(valuation, yesBal, noBal, lpShares)
          const flow = flows.get(addr)!
          bump(addr.toLowerCase(), flow.inRaw - flow.outRaw, totalValue)
          done++
          if (done % 25 === 0 || done === participants.length) {
            console.log(`[user-pnl] ${label}: holdings ${done}/${participants.length}`)
          }
        })

        console.log(`[user-pnl] ${label}: done (status ${valuation.status})`)
        marketsScanned++
      } catch (err) {
        console.warn(
          `[user-pnl] scan failed for ${address} (chain ${chain.chainId}):`,
          err instanceof Error ? err.message : err,
        )
      }
    }
  }

  // Upsert one snapshot row per wallet for today.
  console.log(`[user-pnl] writing ${byWallet.size} wallet snapshot(s) for ${date.toISOString().slice(0, 10)}…`)
  let walletsWritten = 0
  for (const [address, agg] of byWallet) {
    const netInvested = asUsdc(agg.netInvestedRaw)
    const positionValue = agg.positionValue
    const pnl = positionValue - netInvested
    await prisma.userPnlDailySnapshot.upsert({
      where: { address_date: { address, date } },
      update: { pnl, positionValue, netInvested },
      create: { address, date, pnl, positionValue, netInvested },
    })
    walletsWritten++
  }

  return { date: date.toISOString().slice(0, 10), walletsWritten, marketsScanned }
}

// ── History read ────────────────────────────────────────────────────────────

export type PnlPoint = {
  date: string // "YYYY-MM-DD"
  pnl: number
  positionValue: number
  netInvested: number
}

export type PnlHistory = {
  address: string
  current: Omit<PnlPoint, "date"> | null
  points: PnlPoint[]
}

/**
 * Read a wallet's daily P&L series (ascending by day). `days` optionally limits
 * to the trailing window. Returns an empty-but-valid history if nothing stored.
 */
export async function getUserPnlHistory(rawAddress: string, days?: number): Promise<PnlHistory> {
  const address = getAddress(rawAddress).toLowerCase()
  const since = days && days > 0 ? utcDay(new Date(Date.now() - days * 86_400_000)) : undefined

  const rows = await prisma.userPnlDailySnapshot.findMany({
    where: { address, ...(since ? { date: { gte: since } } : {}) },
    orderBy: { date: "asc" },
  })

  const points: PnlPoint[] = rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    pnl: r.pnl.toNumber(),
    positionValue: r.positionValue.toNumber(),
    netInvested: r.netInvested.toNumber(),
  }))

  const last = points[points.length - 1]
  const current = last
    ? { pnl: last.pnl, positionValue: last.positionValue, netInvested: last.netInvested }
    : null

  return { address, current, points }
}

// ── Scheduled worker ──────────────────────────────────────────────────────────

const SNAPSHOT_INTERVAL_MS =
  Number(process.env.USER_PNL_SNAPSHOT_INTERVAL_MS) > 0
    ? Number(process.env.USER_PNL_SNAPSHOT_INTERVAL_MS)
    : 24 * 60 * 60_000 // once a day

/**
 * Single-instance polling worker. Runs the P&L snapshot every SNAPSHOT_INTERVAL_MS
 * (default 24h; override with USER_PNL_SNAPSHOT_INTERVAL_MS). Read-of-chain +
 * writes only our own stats — not a settler, so no worker-lease is needed.
 * Mirrors startChampionPoolProbabilityWorker().
 */
export async function startUserPnlWorker(): Promise<void> {
  console.log(`[user-pnl] worker starting (interval ${SNAPSHOT_INTERVAL_MS}ms)`)

  const run = async () => {
    try {
      const summary = await snapshotUserPnl()
      console.log(
        `[user-pnl] snapshot ${summary.date}: ${summary.walletsWritten} wallet(s) across ${summary.marketsScanned} market(s)`,
      )
    } catch (error) {
      console.error("[user-pnl] snapshot failed:", error instanceof Error ? error.message : error)
    }
  }

  await run()
  setInterval(() => { void run() }, SNAPSHOT_INTERVAL_MS)
}
