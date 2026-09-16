/**
 * World Cup champion probability history — sourced from OUR OWN pools.
 *
 * Companion to services/champion-probability.ts (which mirrors Polymarket and
 * feeds the Explore page). This module instead reads each champion EventMarket's
 * live on-chain `yesProbability()` on the canonical chain (arc-testnet), persists
 * it as a time-series, and serves that history for the dedicated /champion-history
 * page. The two never collide: this writes to `pool_probability_points`, the
 * Polymarket copy writes to `market_probability_points`.
 *
 * Two halves (mirroring champion-probability.ts so the frontend chart is shared):
 *   • snapshotChampionPoolProbabilities() — read `yesProbability()` per team and
 *     write one PoolProbabilityPoint (capturedAt = now). Driven by
 *     startChampionPoolProbabilityWorker() every ~30 min (and the manual script).
 *   • fetchChampionPoolHistory(range)     — read the stored points back, align +
 *     forward-fill them into the { range, updatedAt, teams, points } shape the
 *     frontend already consumes at GET /api/worldcup/champion-pool-history.
 *
 * Read-of-chain + read/write of our own stats; never moves funds, not a settler.
 * `id`/`team`/`flag` come from config/champion-markets.json and match
 * webapp/src/data/worldCupKnockout.ts (and the chart's color keys).
 */
import { createRpcRetry } from "@polypop/rpc"
import { getAddress, type Address, type PublicClient } from "viem"
import { prisma } from "../db"
import { getPublicClient, isSupportedChain } from "../chains"
// Data-only JSON config (the .ts equivalent would live outside src/ and trip
// tsc's rootDir check — same pattern as services/portfolio.ts).
import championMarketsJson from "../../../config/champion-markets.json"

type ChainSlug = "base-sepolia" | "arc-testnet" | "bsc-testnet"

type ChampionMarket = {
  id: string
  team: string
  flag: string
  addresses: Partial<Record<ChainSlug, string>>
}

const CHAMPION_MARKETS = championMarketsJson as ChampionMarket[]
type PoolHistoryMarket = ChampionMarket

/**
 * Fed rate-cut meeting markets, oldest first. Deployed one meeting at a time by
 * contracts/script/CreateFedRateMarkets.s.sol — a market with no address for the
 * chain is simply skipped by both the snapshot and the history read.
 *
 * July has settled (the FOMC held on Jul 29 2026, so it paid out NO). It stays in
 * this list — like the eliminated champion teams, snapshotting is left over the
 * full set — but it is filtered out of the /api/fed/pool-history response by
 * ACTIVE_FED_IDS below, so the chart only shows the meeting that is still trading.
 */
const FED_POOL_MARKETS: PoolHistoryMarket[] = [
  {
    id: "fed-cut-july-2026",
    team: "July Cut",
    flag: "🇺🇸",
    addresses: {
      "base-sepolia": "0x79f5EE54534dCE6E3232a0300B6d14A733c348b4",
      "arc-testnet": "0xf0021cd2F7284cd63d7FF147251Ce7732425600c",
    },
  },
  {
    id: "fed-cut-september-2026",
    team: "September Cut",
    flag: "🇺🇸",
    addresses: {
      "base-sepolia": "0x719Ab420384B4658864eEf34b4197df8B9CF8a0f",
      "arc-testnet": "0xCE924ff2DC25bc1c640E9D22c3B4f03a850B99CE",
    },
  },
]

/**
 * Meetings still ahead — /api/fed/pool-history returns only these, so a settled
 * meeting's flat line doesn't sit on the chart next to the live one. Add the next
 * meeting's id here (and drop the one that just settled) each time the /fed page
 * rolls forward.
 */
const ACTIVE_FED_IDS = new Set<string>(["fed-cut-september-2026"])

/** Fed markets restricted to meetings still trading (read/response path). */
const ACTIVE_FED_MARKETS = FED_POOL_MARKETS.filter((m) => ACTIVE_FED_IDS.has(m.id))

const MIDTERM_POOL_MARKETS: PoolHistoryMarket[] = [
  {
    id: "midterm-house-dems-2026",
    team: "House Dems",
    flag: "🏛️",
    addresses: {
      "base-sepolia": "0x16CA2f4609F56bC21C5BF47F53f741D57183f63d",
      "arc-testnet": "0x29B0f2A2b691C1F5E4E6cC1A32c1E7c7d70A9aaa",
    },
  },
  {
    id: "midterm-senate-reps-2026",
    team: "Senate GOP",
    flag: "🏛️",
    addresses: {
      "base-sepolia": "0xB29c3b828BC694bD165E4E009911775BD31CC619",
      "arc-testnet": "0x48AD8920DA3840fF2d8E1293ba0CE7e7284e0983",
    },
  },
]

/**
 * Crypto-policy markets for the /crypto page. Deployed by
 * contracts/script/CreateCryptoMarkets.s.sol — a market with no address for the
 * chain is skipped by both the snapshot and the history read.
 */
const CRYPTO_POOL_MARKETS: PoolHistoryMarket[] = [
  {
    id: "clarity-act-2026",
    team: "Clarity Act",
    flag: "🪙",
    addresses: {
      "base-sepolia": "0x00713F4c091400D4FaE15FBA720eCd0A22298E91",
      "arc-testnet": "0x0CD73F8E88f6AfF18FE1a8B2f0dd97A2Fa16c166",
    },
  },
]

const SNAPSHOT_POOL_MARKETS: PoolHistoryMarket[] = [
  ...CHAMPION_MARKETS,
  ...FED_POOL_MARKETS,
  ...MIDTERM_POOL_MARKETS,
  ...CRYPTO_POOL_MARKETS,
]

/**
 * Teams still alive in the tournament. The pool-history endpoint returns only
 * these (eliminated teams — Morocco, Belgium, Norway, Switzerland — are dropped
 * from the response). Snapshotting is left over the full set on purpose.
 */
const ACTIVE_TEAM_IDS = new Set<string>([
  "spain-champion-2026",
  "argentina-champion-2026",
  "france-champion-2026",
  "england-champion-2026",
])

/** Champion markets restricted to teams still in contention (read/response path). */
const ACTIVE_CHAMPION_MARKETS = CHAMPION_MARKETS.filter((m) => ACTIVE_TEAM_IDS.has(m.id))

const SLUG_TO_CHAIN_ID: Record<ChainSlug, number> = {
  "base-sepolia": 84532,
  "arc-testnet": 5042002,
  "bsc-testnet": 97,
}

/** Canonical chain the pool odds are sourced from (matches the Explore card link). */
export const CANONICAL_CHAIN_ID =
  Number(process.env.CHAMPION_PROBABILITY_CHAIN_ID) > 0
    ? Number(process.env.CHAMPION_PROBABILITY_CHAIN_ID)
    : SLUG_TO_CHAIN_ID["arc-testnet"]

/** Reverse lookup: chainId → slug, to read the right address out of the config. */
function slugForChainId(chainId: number): ChainSlug | undefined {
  return (Object.keys(SLUG_TO_CHAIN_ID) as ChainSlug[]).find((s) => SLUG_TO_CHAIN_ID[s] === chainId)
}

// EventMarket.yesProbability() → uint256 scaled by 1e18 (see webapp EVENT_MARKET_ABI
// and lib/utils.ts formatProbability). Percent = raw / 1e16.
const YES_PROBABILITY_ABI = [
  {
    type: "function",
    name: "yesProbability",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const
const PROB_TO_PCT = 1e16

const withRpcRetry = createRpcRetry("champion-pool-probability", { retries: 4 })

/** Clamp a raw 1e18-scaled probability to a 0..100 percentage with 2 decimals. */
function toPct(raw: bigint): number {
  const pct = Number(raw) / PROB_TO_PCT
  return Math.min(100, Math.max(0, Math.round(pct * 100) / 100))
}

export type SnapshotRow = {
  id: string
  team: string
  address: string
  yesProbability: number
}

/**
 * Read the champion YES probabilities live from our on-chain pools and persist
 * them to `pool_probability_points`, one row per team keyed by its canonical-chain
 * EventMarket address. Markets with no address on this chain, or whose read
 * reverts (undeployed/settled), are skipped. Returns the rows written.
 */
export async function snapshotChampionPoolProbabilities(
  chainId: number = CANONICAL_CHAIN_ID,
): Promise<SnapshotRow[]> {
  if (!isSupportedChain(chainId)) throw new Error(`Unsupported chain: ${chainId}`)
  const slug = slugForChainId(chainId)
  if (!slug) throw new Error(`No config slug for chain ${chainId}`)

  const client = getPublicClient(chainId) as PublicClient
  const written: SnapshotRow[] = []

  for (const market of SNAPSHOT_POOL_MARKETS) {
    const raw = market.addresses[slug]
    if (!raw) continue
    const address = getAddress(raw) as Address

    let prob: bigint
    try {
      prob = (await withRpcRetry(`yesProbability ${market.id}`, () =>
        client.readContract({ address, abi: YES_PROBABILITY_ABI, functionName: "yesProbability" }),
      )) as bigint
    } catch (error) {
      console.warn(
        `[champion-pool-probability] skipping ${market.team} (${address}):`,
        error instanceof Error ? error.message : error,
      )
      continue
    }

    const yesProbability = toPct(prob)
    await prisma.poolProbabilityPoint.create({
      data: { chainId, contractAddress: address, yesProbability },
    })
    written.push({ id: market.id, team: market.team, address, yesProbability })
  }

  return written
}

// ── History read + shaping ────────────────────────────────────────────────────
// (Deliberately parallels champion-probability.ts — same response shape so the
//  frontend chart component is shared between the two pages.)

// UI range → lookback window in seconds (null = all history).
const RANGE_SECONDS: Record<string, number | null> = {
  "1h": 3_600,
  "6h": 21_600,
  "1d": 86_400,
  "1w": 604_800,
  "1m": 2_592_000,
  all: null,
}
export const DEFAULT_RANGE = "1w"

/** Normalize an arbitrary query value to a supported range key. */
export function normalizeRange(raw: unknown): string {
  const r = String(raw ?? "").toLowerCase()
  return r in RANGE_SECONDS ? r : DEFAULT_RANGE
}

export type PoolHistory = {
  range: string
  updatedAt: string
  teams: { id: string; team: string; flag: string; current: number | null }[]
  /** One row per timestamp: { t: <unix seconds>, [teamId]: <pct 0..100 | null> }. */
  points: Record<string, number | null>[]
}
export type ChampionHistory = PoolHistory

const MAX_POINTS = 400
const CACHE_TTL_MS = 60_000
// One snapshot pass writes all 8 teams within the same wall-clock second, but
// each row gets its own capturedAt; bucket to the minute so a pass collapses to
// one aligned x-axis tick.
const BUCKET_SECONDS = 60

const cache = new Map<string, { expires: number; data: PoolHistory }>()

/** Build the empty-but-valid response (no stored points yet). */
function emptyHistory(range: string, markets: PoolHistoryMarket[]): PoolHistory {
  return {
    range,
    updatedAt: new Date().toISOString(),
    teams: markets.map((m) => ({ id: m.id, team: m.team, flag: m.flag, current: null })),
    points: [],
  }
}

/**
 * Read stored pool probability points for a market set and merge them into the
 * aligned, forward-filled series the chart expects. Individual missing markets
 * degrade to nulls rather than failing the request.
 */
async function fetchPoolHistoryForMarkets(
  range: string,
  markets: PoolHistoryMarket[],
  cacheNamespace: string,
  chainId: number = CANONICAL_CHAIN_ID,
): Promise<PoolHistory> {
  const key = normalizeRange(range)
  const now = Date.now()
  const cacheKey = `${cacheNamespace}:${chainId}:${key}`
  const hit = cache.get(cacheKey)
  if (hit && hit.expires > now) return hit.data

  const slug = slugForChainId(chainId)
  if (!slug) return emptyHistory(key, markets)

  // Map contract address (checksummed) → market id for this chain.
  const addressToId = new Map<string, string>()
  for (const m of markets) {
    const raw = m.addresses[slug]
    if (raw) addressToId.set(getAddress(raw), m.id)
  }
  if (addressToId.size === 0) return emptyHistory(key, markets)

  const windowSeconds = RANGE_SECONDS[key]
  const where = {
    chainId,
    contractAddress: { in: [...addressToId.keys()] },
    ...(windowSeconds ? { capturedAt: { gte: new Date(now - windowSeconds * 1000) } } : {}),
  }

  const rows = await prisma.poolProbabilityPoint.findMany({
    where,
    select: { contractAddress: true, yesProbability: true, capturedAt: true },
    orderBy: { capturedAt: "asc" },
  })
  if (rows.length === 0) return emptyHistory(key, markets)

  // Bucket rows to the minute; within a bucket keep each team's latest value.
  // bucketMap: bucketTs(seconds) → (teamId → pct)
  const bucketMap = new Map<number, Map<string, number>>()
  for (const row of rows) {
    const id = addressToId.get(getAddress(row.contractAddress))
    if (!id) continue
    const sec = Math.floor(row.capturedAt.getTime() / 1000)
    const bucket = Math.floor(sec / BUCKET_SECONDS) * BUCKET_SECONDS
    let teams = bucketMap.get(bucket)
    if (!teams) {
      teams = new Map<string, number>()
      bucketMap.set(bucket, teams)
    }
    teams.set(id, Number(row.yesProbability))
  }

  let timestamps = [...bucketMap.keys()].sort((a, b) => a - b)

  // Downsample evenly if there are more buckets than MAX_POINTS; always keep last.
  if (timestamps.length > MAX_POINTS) {
    const step = timestamps.length / MAX_POINTS
    const picked: number[] = []
    for (let i = 0; i < MAX_POINTS; i++) picked.push(timestamps[Math.floor(i * step)])
    picked[picked.length - 1] = timestamps[timestamps.length - 1]
    timestamps = [...new Set(picked)]
  }

  // Forward-fill each team across the timeline: carry the last known value; null
  // only until a team's first recorded point.
  const teamIds = markets.map((m) => m.id)
  const lastPct: Record<string, number | null> = {}
  for (const id of teamIds) lastPct[id] = null

  const points: Record<string, number | null>[] = []
  for (const t of timestamps) {
    const teams = bucketMap.get(t)
    const row: Record<string, number | null> = { t }
    for (const id of teamIds) {
      const v = teams?.get(id)
      if (v !== undefined) lastPct[id] = v
      row[id] = lastPct[id]
    }
    points.push(row)
  }

  const teams = markets.map((m) => ({
    id: m.id,
    team: m.team,
    flag: m.flag,
    current: lastPct[m.id],
  }))

  const data: PoolHistory = { range: key, updatedAt: new Date(now).toISOString(), teams, points }
  cache.set(cacheKey, { expires: now + CACHE_TTL_MS, data })
  return data
}

export async function fetchChampionPoolHistory(
  range: string,
  chainId: number = CANONICAL_CHAIN_ID,
): Promise<ChampionHistory> {
  return fetchPoolHistoryForMarkets(range, ACTIVE_CHAMPION_MARKETS, "champion", chainId)
}

export async function fetchFedPoolHistory(
  range: string,
  chainId: number = CANONICAL_CHAIN_ID,
): Promise<PoolHistory> {
  return fetchPoolHistoryForMarkets(range, ACTIVE_FED_MARKETS, "fed", chainId)
}

export async function fetchMidtermPoolHistory(
  range: string,
  chainId: number = CANONICAL_CHAIN_ID,
): Promise<PoolHistory> {
  return fetchPoolHistoryForMarkets(range, MIDTERM_POOL_MARKETS, "midterm", chainId)
}

export async function fetchCryptoPoolHistory(
  range: string,
  chainId: number = CANONICAL_CHAIN_ID,
): Promise<PoolHistory> {
  return fetchPoolHistoryForMarkets(range, CRYPTO_POOL_MARKETS, "crypto", chainId)
}

// ── Scheduled worker ───────────────────────────────────────────────────────────

const SNAPSHOT_INTERVAL_MS =
  Number(process.env.CHAMPION_POOL_PROBABILITY_INTERVAL_MS) > 0
    ? Number(process.env.CHAMPION_POOL_PROBABILITY_INTERVAL_MS)
    : 30 * 60_000

/**
 * Single-instance polling worker. Snapshots champion pool probabilities from our
 * on-chain EventMarkets every SNAPSHOT_INTERVAL_MS (default 30 min; override with
 * CHAMPION_POOL_PROBABILITY_INTERVAL_MS). Read-of-chain + writes only our own
 * stats — not a settler, so no worker-lease is needed. Mirrors
 * startChampionProbabilityWorker().
 */
export async function startChampionPoolProbabilityWorker(): Promise<void> {
  console.log(
    `[champion-pool-probability] worker starting (interval ${SNAPSHOT_INTERVAL_MS}ms, source on-chain pools on chain ${CANONICAL_CHAIN_ID})`,
  )

  const run = async () => {
    try {
      const written = await snapshotChampionPoolProbabilities()
      console.log(`[champion-pool-probability] snapshot wrote ${written.length} point(s)`)
    } catch (error) {
      console.error(
        "[champion-pool-probability] snapshot failed:",
        error instanceof Error ? error.message : error,
      )
    }
  }

  await run()
  setInterval(() => { void run() }, SNAPSHOT_INTERVAL_MS)
}
