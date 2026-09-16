/**
 * World Cup champion probability history — sourced from POLYMARKET.
 *
 * The Explore page overlays a time-series probability chart for our 8 "tournament
 * winner" EventMarkets. Our own testnet pools are thin and give uninformative
 * odds, so the chart tracks the real, liquid Polymarket "world-cup-winner" market
 * instead (see services/worldcup-history.ts for the Polymarket client + token map).
 *
 * Polymarket keeps full price history, but we still persist our own copy so the
 * chart survives a Polymarket outage and so freshness is driven on OUR schedule.
 *
 * Two halves:
 *   • snapshotChampionProbabilities() — pulls the current Polymarket YES prob per
 *     team and writes it as a MarketProbabilityPoint (keyed by the team's
 *     canonical-chain EventMarket address, so the reader below is unchanged).
 *     Driven by startChampionProbabilityWorker() every ~30 min (and the manual
 *     script). On a team's first pass it backfills the full Polymarket series.
 *   • fetchChampionHistory(range)     — reads the stored points back, aligns +
 *     forward-fills them into the { range, updatedAt, teams, points } shape the
 *     frontend already consumes at GET /api/worldcup/champion-history.
 *
 * Read of an external API + read/write of our own stats; never moves funds, not a
 * settler. `id`/`team`/`flag` come from config/champion-markets.json and match
 * webapp/src/data/worldCupKnockout.ts (and the chart's color keys).
 */
import { getAddress, type Address } from "viem"
import { prisma } from "../db"
import { isSupportedChain } from "../chains"
import { fetchChampionHistory as fetchPolymarketHistory } from "./worldcup-history"
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

const SLUG_TO_CHAIN_ID: Record<ChainSlug, number> = {
  "base-sepolia": 84532,
  "arc-testnet": 5042002,
  "bsc-testnet": 97,
}

/** Canonical chain the chart's odds are sourced from (matches the Explore card link). */
export const CANONICAL_CHAIN_ID =
  Number(process.env.CHAMPION_PROBABILITY_CHAIN_ID) > 0
    ? Number(process.env.CHAMPION_PROBABILITY_CHAIN_ID)
    : SLUG_TO_CHAIN_ID["arc-testnet"]

/** Reverse lookup: chainId → slug, to read the right address out of the config. */
function slugForChainId(chainId: number): ChainSlug | undefined {
  return (Object.keys(SLUG_TO_CHAIN_ID) as ChainSlug[]).find((s) => SLUG_TO_CHAIN_ID[s] === chainId)
}

// Window pulled from Polymarket on a team's FIRST snapshot so the chart has depth
// immediately instead of only from worker start. "1m" maps to Polymarket's max
// interval at 3h fidelity (see worldcup-history RANGE_MAP), capped to 400 points.
const BACKFILL_RANGE = "1m"

export type SnapshotRow = {
  id: string
  team: string
  address: string
  yesProbability: number
  /** Rows written this pass (>1 only on a team's first-run backfill). */
  count: number
}

/**
 * Pull the champion YES probabilities from Polymarket and persist them to
 * `market_probability_points`, keyed by each team's canonical-chain EventMarket
 * address so the address-keyed history reader below serves them unchanged.
 *
 * On a team's FIRST snapshot (no stored rows yet) the full Polymarket series is
 * backfilled with its real timestamps; every later pass appends just the current
 * probability (capturedAt = now). Teams with no canonical address, or no
 * Polymarket data, are skipped. Returns the rows written.
 */
export async function snapshotChampionProbabilities(
  chainId: number = CANONICAL_CHAIN_ID,
): Promise<SnapshotRow[]> {
  if (!isSupportedChain(chainId)) throw new Error(`Unsupported chain: ${chainId}`)
  const slug = slugForChainId(chainId)
  if (!slug) throw new Error(`No config slug for chain ${chainId}`)

  // One Polymarket fetch covers all teams (its 60s cache shields the endpoint).
  const history = await fetchPolymarketHistory(BACKFILL_RANGE)
  const currentById = new Map(history.teams.map((t) => [t.id, t.current]))

  const written: SnapshotRow[] = []

  for (const market of CHAMPION_MARKETS) {
    const raw = market.addresses[slug]
    if (!raw) continue
    const address = getAddress(raw) as Address

    const existing = await prisma.marketProbabilityPoint.findFirst({
      where: { chainId, contractAddress: address },
      select: { capturedAt: true },
      orderBy: { capturedAt: "desc" },
    })

    // First time we see this team: backfill its whole Polymarket series so the
    // chart isn't empty until points accrue.
    if (!existing) {
      const rows = history.points
        .filter((p) => typeof p[market.id] === "number")
        .map((p) => ({
          chainId,
          contractAddress: address,
          yesProbability: p[market.id] as number,
          capturedAt: new Date((p.t as number) * 1000),
        }))
      if (rows.length === 0) continue
      await prisma.marketProbabilityPoint.createMany({ data: rows })
      written.push({
        id: market.id,
        team: market.team,
        address,
        yesProbability: rows[rows.length - 1].yesProbability,
        count: rows.length,
      })
      continue
    }

    // Steady state: append the current Polymarket probability at wall-clock now.
    const current = currentById.get(market.id)
    if (typeof current !== "number") continue
    await prisma.marketProbabilityPoint.create({
      data: { chainId, contractAddress: address, yesProbability: current },
    })
    written.push({ id: market.id, team: market.team, address, yesProbability: current, count: 1 })
  }

  return written
}

// ── History read + shaping ────────────────────────────────────────────────────

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

export type ChampionHistory = {
  range: string
  updatedAt: string
  teams: { id: string; team: string; flag: string; current: number | null }[]
  /** One row per timestamp: { t: <unix seconds>, [teamId]: <pct 0..100 | null> }. */
  points: Record<string, number | null>[]
}

const MAX_POINTS = 400
const CACHE_TTL_MS = 60_000
// One snapshot pass writes all 8 teams within the same wall-clock second, but
// each row gets its own capturedAt; bucket to the minute so a pass collapses to
// one aligned x-axis tick.
const BUCKET_SECONDS = 60

const cache = new Map<string, { expires: number; data: ChampionHistory }>()

/** Build the empty-but-valid response (no stored points yet). */
function emptyHistory(range: string): ChampionHistory {
  return {
    range,
    updatedAt: new Date().toISOString(),
    teams: CHAMPION_MARKETS.map((m) => ({ id: m.id, team: m.team, flag: m.flag, current: null })),
    points: [],
  }
}

/**
 * Read stored probability points for the canonical chain and merge them into the
 * aligned, forward-filled series the chart expects. Individual missing teams
 * degrade to nulls rather than failing the request.
 */
export async function fetchChampionHistory(
  range: string,
  chainId: number = CANONICAL_CHAIN_ID,
): Promise<ChampionHistory> {
  const key = normalizeRange(range)
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && hit.expires > now) return hit.data

  const slug = slugForChainId(chainId)
  if (!slug) return emptyHistory(key)

  // Map contract address (checksummed) → team id for this chain.
  const addressToId = new Map<string, string>()
  for (const m of CHAMPION_MARKETS) {
    const raw = m.addresses[slug]
    if (raw) addressToId.set(getAddress(raw), m.id)
  }
  if (addressToId.size === 0) return emptyHistory(key)

  const windowSeconds = RANGE_SECONDS[key]
  const where = {
    chainId,
    contractAddress: { in: [...addressToId.keys()] },
    ...(windowSeconds ? { capturedAt: { gte: new Date(now - windowSeconds * 1000) } } : {}),
  }

  const rows = await prisma.marketProbabilityPoint.findMany({
    where,
    select: { contractAddress: true, yesProbability: true, capturedAt: true },
    orderBy: { capturedAt: "asc" },
  })
  if (rows.length === 0) return emptyHistory(key)

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
  const teamIds = CHAMPION_MARKETS.map((m) => m.id)
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

  const teams = CHAMPION_MARKETS.map((m) => ({
    id: m.id,
    team: m.team,
    flag: m.flag,
    current: lastPct[m.id],
  }))

  const data: ChampionHistory = { range: key, updatedAt: new Date(now).toISOString(), teams, points }
  cache.set(key, { expires: now + CACHE_TTL_MS, data })
  return data
}

// ── Scheduled worker ───────────────────────────────────────────────────────────

const SNAPSHOT_INTERVAL_MS =
  Number(process.env.CHAMPION_PROBABILITY_INTERVAL_MS) > 0
    ? Number(process.env.CHAMPION_PROBABILITY_INTERVAL_MS)
    : 30 * 60_000

/**
 * Single-instance polling worker. Snapshots champion probabilities from Polymarket
 * every SNAPSHOT_INTERVAL_MS (default 30 min; override with
 * CHAMPION_PROBABILITY_INTERVAL_MS). Reads an external API + writes only our own
 * stats — not a settler, so no worker-lease is needed. Mirrors
 * startEventMarketStatsWorker().
 */
export async function startChampionProbabilityWorker(): Promise<void> {
  console.log(
    `[champion-probability] worker starting (interval ${SNAPSHOT_INTERVAL_MS}ms, source Polymarket, keyed on chain ${CANONICAL_CHAIN_ID})`,
  )

  const run = async () => {
    try {
      const written = await snapshotChampionProbabilities()
      const points = written.reduce((n, r) => n + r.count, 0)
      console.log(`[champion-probability] snapshot wrote ${points} point(s) across ${written.length} team(s)`)
    } catch (error) {
      console.error("[champion-probability] snapshot failed:", error instanceof Error ? error.message : error)
    }
  }

  await run()
  setInterval(() => { void run() }, SNAPSHOT_INTERVAL_MS)
}
