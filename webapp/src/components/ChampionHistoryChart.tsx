import { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { apiFetch } from '@/lib/api'

// Time-series YES probability for related EventMarket pools, overlaid as a
// multi-line hero chart. Reused by pages via props:
//   • Explore page — Polymarket-mirrored odds (GET /api/worldcup/champion-history).
//   • /champion-history — our OWN on-chain pool odds
//     (GET /api/worldcup/champion-pool-history).
// Other market collection pages can pass their own pool-history endpoint. All
// endpoints return the same { range, updatedAt, teams, points } shape.
// See bot/src/common/services/champion-probability.ts and champion-pool-probability.ts.

type ChampionHistory = {
  range: string
  updatedAt: string
  teams: { id: string; team: string; flag: string; current: number | null }[]
  points: Record<string, number | null>[]
}

// Validated 8-hue categorical palette (dataviz skill reference, light mode —
// worst adjacent CVD ΔE 24.2). Color follows the team entity, fixed order.
const TEAM_COLORS: Record<string, string> = {
  'france-champion-2026': '#2a78d6', // blue
  'morocco-champion-2026': '#1baf7a', // aqua
  'spain-champion-2026': '#eda100', // yellow
  'belgium-champion-2026': '#008300', // green
  'norway-champion-2026': '#4a3aa7', // violet
  'england-champion-2026': '#e34948', // red
  'argentina-champion-2026': '#e87ba4', // magenta
  'switzerland-champion-2026': '#eb6834', // orange
  // Fed meetings: the meeting now trading gets the strong blue, settled ones go
  // grey so a resolved series never competes with the live line.
  'fed-cut-july-2026': '#898781', // settled NO (Jul 29 2026)
  'fed-cut-september-2026': '#2a78d6',
  'fed-cut-october-2026': '#1baf7a',
  'fed-cut-december-2026': '#eda100',
  'midterm-house-dems-2026': '#2a78d6',
  'midterm-senate-reps-2026': '#e34948',
  'clarity-act-2026': '#eb6834', // orange
}
const FALLBACK_COLOR = '#898781'

const RANGES: { key: string; label: string }[] = [
  { key: '1h', label: '1H' },
  { key: '6h', label: '6H' },
  { key: '1d', label: '1D' },
  { key: '1w', label: '1W' },
  { key: '1m', label: '1M' },
  { key: 'all', label: 'All' },
]

const AXIS = {
  stroke: 'var(--color-muted)',
  tick: { fill: 'var(--color-muted)', fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const

// Locale-independent UTC tick label; granularity follows the selected range.
function formatTick(unix: number, range: string): string {
  const d = new Date(unix * 1000)
  if (range === '1h' || range === '6h' || range === '1d') {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function formatFull(unix: number): string {
  const d = new Date(unix * 1000)
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
  return `${date} · ${time} UTC`
}

function ChartTooltip({
  active, payload, label, teams,
}: {
  active?: boolean
  payload?: { dataKey: string; value: number | null }[]
  label?: number
  teams: ChampionHistory['teams']
}) {
  if (!active || !payload || label === undefined) return null
  const byId = new Map(payload.map((p) => [p.dataKey, p.value]))
  const rows = teams
    .map((t) => ({ ...t, value: byId.get(t.id) ?? null }))
    .filter((r) => r.value !== null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  return (
    <div className="rounded-xl border border-[rgba(20,20,20,0.1)] bg-white/95 px-3 py-2 shadow-[0_8px_30px_rgba(20,20,20,0.12)] backdrop-blur">
      <div className="mb-1.5 text-[11px] font-medium text-[var(--color-muted)]">{formatFull(label)}</div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: TEAM_COLORS[r.id] ?? FALLBACK_COLOR }} />
              <span className="text-[var(--color-ink)]">{r.flag} {r.team}</span>
            </span>
            <span className="font-semibold tabular-nums text-[var(--color-ink)]">{(r.value ?? 0).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

type ChampionHistoryChartProps = {
  /** API path returning the { range, updatedAt, teams, points } shape. */
  endpoint?: string
  title?: string
  subtitle?: string
  /** Bottom-right attribution line. */
  footer?: string
  /** Optional display filter; the endpoint may return a wider market set. */
  teamIds?: string[]
  /** Tailwind height classes for the chart body. */
  chartClassName?: string
  /** Dense version for small side-by-side charts. */
  compact?: boolean
  /** Range selected on first render; must be one of the RANGES keys. */
  defaultRange?: string
  /** Extra classes for the outer card (e.g. `flex flex-col` to let the chart fill a grid row). */
  className?: string
}

export function ChampionHistoryChart({
  endpoint = '/api/worldcup/champion-history',
  title = 'World Cup Winner — live odds',
  subtitle = 'Implied probability over time for all eight quarter-finalists.',
  footer = 'Odds data via Polymarket',
  teamIds,
  chartClassName = 'h-[300px] md:h-[360px]',
  compact = false,
  defaultRange = '1w',
  className = '',
}: ChampionHistoryChartProps = {}) {
  const [range, setRange] = useState(defaultRange)
  const [data, setData] = useState<ChampionHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  function selectRange(key: string) {
    if (key === range) return
    // Set the pending/loading state here (a user event) rather than inside the
    // effect, which the react-hooks lint rule forbids for synchronous setState.
    setLoading(true)
    setError(false)
    setRange(key)
  }

  useEffect(() => {
    let cancelled = false
    apiFetch(`${endpoint}?range=${range}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((json: ChampionHistory) => {
        if (!cancelled) setData(json)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [range, endpoint])

  const displayTeams = useMemo(() => {
    if (!data) return []
    if (!teamIds || teamIds.length === 0) return data.teams
    const allowed = new Set(teamIds)
    return data.teams.filter((team) => allowed.has(team.id))
  }, [data, teamIds])

  // Legend / line order — highest current probability first.
  const orderedTeams = useMemo(() => {
    return [...displayTeams].sort((a, b) => (b.current ?? 0) - (a.current ?? 0))
  }, [displayTeams])

  const hasPoints = !!data && data.points.length > 0 && orderedTeams.length > 0
  const cardClassName = compact
    ? 'overflow-hidden rounded-[24px] border border-[rgba(0,82,255,0.18)] bg-white p-4 shadow-[0_8px_28px_rgba(20,20,20,0.04)] md:p-5'
    : 'overflow-hidden rounded-[32px] border border-[rgba(0,82,255,0.18)] bg-white p-6 shadow-[0_10px_40px_rgba(20,20,20,0.05)] md:p-7'
  const titleClassName = compact
    ? 'text-base font-semibold tracking-[-0.01em]'
    : 'text-lg font-semibold tracking-[-0.01em] md:text-xl'
  const rangeClassName = compact
    ? 'inline-flex items-center gap-2'
    : 'inline-flex rounded-full border border-[rgba(20,20,20,0.1)] bg-[rgba(20,20,20,0.03)] p-1'
  const rangeButtonClassName = (key: string) => compact
    ? `px-0.5 py-0.5 text-[11px] font-semibold transition ${
        range === key ? 'text-[#007AFF]' : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
      }`
    : `rounded-full px-3 py-1 text-xs font-semibold transition ${
        range === key
          ? 'bg-white text-[#007AFF] shadow-[0_1px_4px_rgba(20,20,20,0.12)]'
          : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
      }`

  return (
    <div className={`${cardClassName} ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={titleClassName}>{title}</h3>
          {!compact && subtitle && <p className="mt-1 text-sm text-[var(--color-muted)]">{subtitle}</p>}
        </div>
        {/* Range selector */}
        <div className={rangeClassName}>
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => selectRange(r.key)}
              className={rangeButtonClassName(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend — flag + team + current %, sorted desc */}
      {hasPoints && (
        <div className={`${compact ? 'mt-3 gap-x-3 gap-y-1' : 'mt-4 gap-x-5 gap-y-2'} flex flex-wrap`}>
          {orderedTeams.map((t) => (
            <span key={t.id} className={`flex items-center gap-1.5 ${compact ? 'text-xs' : 'text-sm'}`}>
              <span className={compact ? 'h-2 w-2 rounded-full' : 'h-2.5 w-2.5 rounded-full'} style={{ background: TEAM_COLORS[t.id] ?? FALLBACK_COLOR }} />
              <span className="font-medium text-[var(--color-ink)]">{t.flag} {t.team}</span>
              <span className="font-semibold tabular-nums text-[var(--color-muted)]">
                {t.current === null ? '—' : `${t.current.toFixed(1)}%`}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className={`${compact ? 'mt-3' : 'mt-5'} ${chartClassName}`}>
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted)]">Loading odds…</div>
        ) : error || !hasPoints ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[rgba(20,20,20,0.12)] text-sm text-[var(--color-muted)]">
            Odds history is temporarily unavailable.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data!.points} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,20,20,0.06)" vertical={false} />
              <XAxis
                dataKey="t"
                {...AXIS}
                minTickGap={48}
                tickFormatter={(v) => formatTick(Number(v), range)}
              />
              <YAxis
                {...AXIS}
                width={44}
                domain={[0, 'auto']}
                tickFormatter={(v) => `${Math.round(Number(v))}%`}
              />
              <Tooltip
                content={<ChartTooltip teams={orderedTeams} />}
                cursor={{ stroke: 'rgba(20,20,20,0.25)', strokeWidth: 1 }}
              />
              {/* Lines drawn low→high so the leaders render on top. */}
              {[...orderedTeams].reverse().map((t) => (
                <Line
                  key={t.id}
                  type="monotone"
                  dataKey={t.id}
                  name={t.team}
                  stroke={TEAM_COLORS[t.id] ?? FALLBACK_COLOR}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {!compact && footer && <p className="mt-3 text-right text-[11px] text-[var(--color-muted)]">{footer}</p>}
    </div>
  )
}
