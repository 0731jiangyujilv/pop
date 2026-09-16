// World Cup champion probability history — Polymarket proxy.
//
// The Explore page overlays a time-series probability chart for our 8 "tournament
// winner" markets. Our own EventMarket contracts don't persist historical
// probability (only a single overwritten live snapshot), so we source the history
// from Polymarket's public, unauthenticated CLOB `prices-history` endpoint.
//
// This module maps each of our champion markets to its Polymarket YES outcome
// token, fetches each token's price history, and merges the per-token series into
// one aligned, forward-filled timeline ready for charting. Results are cached in
// memory per range (Polymarket updates slowly and this shields it from per-visitor
// polling).
//
// Token ids come from the Polymarket "world-cup-winner" event (id 30615). `id`,
// `team`, and `flag` mirror webapp/src/data/worldCupKnockout.ts CHAMPION_MARKETS so
// the frontend can key colors/labels off the same ids.

const CLOB_BASE = "https://clob.polymarket.com/prices-history"

export type ChampionToken = {
  id: string
  team: string
  flag: string
  /** Polymarket YES outcome clobTokenId for this team in event 30615. */
  yesTokenId: string
}

export const CHAMPION_TOKENS: ChampionToken[] = [
  { id: "france-champion-2026", team: "France", flag: "🇫🇷", yesTokenId: "108233603819467706476318984012158651931658302669301887462181073562758483842092" },
  { id: "morocco-champion-2026", team: "Morocco", flag: "🇲🇦", yesTokenId: "69910730841487615802736046038473620030754616421912831175284551372639933569112" },
  { id: "spain-champion-2026", team: "Spain", flag: "🇪🇸", yesTokenId: "4394372887385518214471608448209527405727552777602031099972143344338178308080" },
  { id: "belgium-champion-2026", team: "Belgium", flag: "🇧🇪", yesTokenId: "30815807067456631524510535002617106205417832891402132396713720656146245200000" },
  { id: "norway-champion-2026", team: "Norway", flag: "🇳🇴", yesTokenId: "60447443643099453130956385288904175887233107411078568881602330835010340506057" },
  { id: "england-champion-2026", team: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", yesTokenId: "115556263888245616435851357148058235707004733438163639091106356867234218207169" },
  { id: "argentina-champion-2026", team: "Argentina", flag: "🇦🇷", yesTokenId: "18812649149814341758733697580460697418474693998558159483117100240528657629879" },
  { id: "switzerland-champion-2026", team: "Switzerland", flag: "🇨🇭", yesTokenId: "62131913648515148266463816694306031394539656598501514114816028349608560215534" },
]

// UI range → Polymarket { interval, fidelity(minutes) }.
const RANGE_MAP: Record<string, { interval: string; fidelity: number }> = {
  "1h": { interval: "1h", fidelity: 1 },
  "6h": { interval: "6h", fidelity: 5 },
  "1d": { interval: "1d", fidelity: 10 },
  "1w": { interval: "1w", fidelity: 60 },
  "1m": { interval: "max", fidelity: 180 },
  all: { interval: "max", fidelity: 720 },
}

export const DEFAULT_RANGE = "1w"

/** Normalize an arbitrary query value to a supported range key. */
export function normalizeRange(raw: unknown): string {
  const r = String(raw ?? "").toLowerCase()
  return r in RANGE_MAP ? r : DEFAULT_RANGE
}

export type ChampionHistory = {
  range: string
  updatedAt: string
  teams: { id: string; team: string; flag: string; current: number | null }[]
  /** One row per timestamp: { t: <unix seconds>, [teamId]: <pct 0..100 | null> }. */
  points: Record<string, number | null>[]
}

type RawPoint = { t: number; p: number }

const MAX_POINTS = 400
const CACHE_TTL_MS = 60_000

const cache = new Map<string, { expires: number; data: ChampionHistory }>()

async function fetchTokenHistory(tokenId: string, interval: string, fidelity: number): Promise<RawPoint[]> {
  const url = `${CLOB_BASE}?market=${tokenId}&interval=${interval}&fidelity=${fidelity}`
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } })
    if (!res.ok) {
      console.warn(`worldcup-history: token ${tokenId} returned HTTP ${res.status}`)
      return []
    }
    const body = (await res.json()) as { history?: RawPoint[] }
    return Array.isArray(body.history) ? body.history : []
  } catch (err) {
    console.warn(`worldcup-history: fetch failed for token ${tokenId}:`, err)
    return []
  }
}

/** Round a 0..1 price to a 0..100 percentage with 2 decimals. */
function toPct(p: number): number {
  return Math.round(p * 100 * 100) / 100
}

/**
 * Fetch and merge the 8 champion series for a range. Individual token failures
 * degrade to an empty series for that team rather than failing the whole request.
 */
export async function fetchChampionHistory(range: string): Promise<ChampionHistory> {
  const key = normalizeRange(range)
  const hit = cache.get(key)
  const now = Date.now()
  if (hit && hit.expires > now) return hit.data

  const { interval, fidelity } = RANGE_MAP[key]
  const series = await Promise.all(
    CHAMPION_TOKENS.map(async (t) => ({
      token: t,
      history: await fetchTokenHistory(t.yesTokenId, interval, fidelity),
    })),
  )

  // Union of all timestamps across teams, ascending.
  const tsSet = new Set<number>()
  for (const s of series) for (const pt of s.history) tsSet.add(pt.t)
  let timestamps = Array.from(tsSet).sort((a, b) => a - b)

  // Downsample evenly if the union is larger than MAX_POINTS (keeps payload small
  // and the chart legible). Always keep the last point.
  if (timestamps.length > MAX_POINTS) {
    const step = timestamps.length / MAX_POINTS
    const picked: number[] = []
    for (let i = 0; i < MAX_POINTS; i++) picked.push(timestamps[Math.floor(i * step)])
    picked[picked.length - 1] = timestamps[timestamps.length - 1]
    timestamps = Array.from(new Set(picked))
  }

  // Per-team lookup { t -> p } for forward-fill.
  const byToken = series.map((s) => {
    const m = new Map<number, number>()
    for (const pt of s.history) m.set(pt.t, pt.p)
    return { id: s.token.id, map: m, hasData: s.history.length > 0 }
  })

  const points: Record<string, number | null>[] = []
  const lastPct: Record<string, number | null> = {}
  for (const id of byToken.map((b) => b.id)) lastPct[id] = null

  for (const t of timestamps) {
    const row: Record<string, number | null> = { t }
    for (const b of byToken) {
      const v = b.map.get(t)
      if (v !== undefined) lastPct[b.id] = toPct(v)
      // Forward-fill: carry the last known value; null only until a team's first point.
      row[b.id] = b.hasData ? lastPct[b.id] : null
    }
    points.push(row)
  }

  const teams = CHAMPION_TOKENS.map((t) => ({
    id: t.id,
    team: t.team,
    flag: t.flag,
    current: lastPct[t.id],
  }))

  const data: ChampionHistory = {
    range: key,
    updatedAt: new Date(now).toISOString(),
    teams,
    points,
  }
  cache.set(key, { expires: now + CACHE_TTL_MS, data })
  return data
}
