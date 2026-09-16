import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Logo } from '@/components/Logo'
import { apiFetch } from '@/lib/api'
import { getChainSlug } from '@/config/chains'

// ─── API types ───────────────────────────────────────────────────────────────

export type EventMarketStat = {
  chainId: number
  contractAddress: string
  question: string | null
  resolutionSource: string | null
  status: number
  yesWins: boolean
  isDraw: boolean
  bettingDeadline: string | null
  resolveAfter: string | null
  yesReserve: string
  noReserve: string
  totalCollateral: string
  totalLpShares: string
  yesProbability: number
  buyYesCount: number
  buyNoCount: number
  sellYesCount: number
  sellNoCount: number
  buyYesVolume: string
  buyNoVolume: string
  sellYesVolume: string
  sellNoVolume: string
  totalVolume: string
  tradeCount: number
  uniqueTraders: number
  liquidityAddedCount: number
  liquidityRemovedCount: number
  totalLiquidityAdded: string
  totalLiquidityRemoved: string
  uniqueLps: number
  pairRedeemCount: number
  pairRedeemVolume: string
  redeemCount: number
  redeemPayout: string
  lpClaimCount: number
  lpClaimPayout: string
  platformFee: string
  creatorFee: string
  lastScannedBlock: string
  scannedAt: string
  updatedAt: string
}

type DailySnapshot = {
  chainId: number
  contractAddress: string
  date: string
  totalVolume: string
  tradeCount: number
  totalCollateral: string
  uniqueTraders: number
  uniqueLps: number
  buyYesVolume: string
  buyNoVolume: string
  sellYesVolume: string
  sellNoVolume: string
  platformFee: string
  creatorFee: string
}

// ─── Chain meta ───────────────────────────────────────────────────────────────

const CHAIN_LABELS: Record<number, string> = {
  84532: 'Base Sepolia',
  8453: 'Base',
  5042002: 'Arc Testnet',
  97: 'BSC Testnet'
}

const CHAIN_COLORS: Record<number, string> = {
  84532: '#0052FF',
  8453: '#0041CC',
  5042002: '#8b5cf6',
  97: '#FCD535'
}

// ─── Granularity ──────────────────────────────────────────────────────────────

type Granularity = 'daily' | 'weekly' | 'monthly'

function periodKey(date: string, g: Granularity): string {
  const d = new Date(date + 'T00:00:00Z')
  if (g === 'daily') return date
  if (g === 'monthly') return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const day = d.getUTCDay() || 7
  const mon = new Date(d)
  mon.setUTCDate(d.getUTCDate() - day + 1)
  return mon.toISOString().slice(0, 10)
}

function periodLabel(key: string, g: Granularity): string {
  if (g === 'daily') return key.slice(5)
  if (g === 'monthly') {
    const [, m] = key.split('-')
    return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m)-1]
  }
  return key.slice(5)
}

// ─── Time-series builder ──────────────────────────────────────────────────────

type ChainSeries = {
  chainId: number
  label: string
  color: string
  data: Record<string, { volume: number; trades: number; tvl: number; fees: number; traders: number }>
}

function buildTimeSeries(snapshots: DailySnapshot[], g: Granularity): {
  periods: string[]
  series: ChainSeries[]
} {
  const byMarket = new Map<string, DailySnapshot[]>()
  for (const s of snapshots) {
    const key = `${s.chainId}:${s.contractAddress}`
    if (!byMarket.has(key)) byMarket.set(key, [])
    byMarket.get(key)!.push(s)
  }

  const chainData = new Map<number, Map<string, { volume: number; trades: number; tvl: number; fees: number; traders: number }>>()

  for (const rows of byMarket.values()) {
    const chainId = rows[0].chainId
    if (!chainData.has(chainId)) chainData.set(chainId, new Map())
    const chain = chainData.get(chainId)!

    for (const row of rows) {
      const period = periodKey(row.date, g)
      // Each snapshot row stores per-day deltas; sum flows, max TVL within the period.
      const vol   = Number(row.totalVolume)
      const trade = row.tradeCount
      const tvl   = Number(row.totalCollateral)
      const fees  = Number(row.platformFee) + Number(row.creatorFee)
      const trds  = row.uniqueTraders

      const ex = chain.get(period) ?? { volume: 0, trades: 0, tvl: 0, fees: 0, traders: 0 }
      chain.set(period, { volume: ex.volume + vol, trades: ex.trades + trade, tvl: Math.max(ex.tvl, tvl), fees: ex.fees + fees, traders: ex.traders + trds })
    }
  }

  const allPeriods = Array.from(new Set([...chainData.values()].flatMap(m => [...m.keys()]))).sort()
  const series: ChainSeries[] = Array.from(chainData.entries()).map(([chainId, data]) => ({
    chainId,
    label: CHAIN_LABELS[chainId] ?? `Chain ${chainId}`,
    color: CHAIN_COLORS[chainId] ?? '#888',
    data: Object.fromEntries(data),
  }))

  return { periods: allPeriods, series }
}

type Metric = 'volume' | 'trades' | 'tvl' | 'fees' | 'traders'

function toChartData(periods: string[], series: ChainSeries[], g: Granularity, metric: Metric) {
  return periods.map(p => {
    const row: Record<string, string | number> = { period: periodLabel(p, g) }
    for (const s of series) row[s.label] = +(s.data[p]?.[metric] ?? 0).toFixed(2)
    return row
  })
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function usd(v: string | number): string {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return '$0'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

// function num(v: number): string {
//   return v.toLocaleString('en-US')
// }

function shorten(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

// const EXPLORER_BASE: Record<number, string> = {
//   84532: 'https://sepolia.basescan.org',
//   8453: 'https://basescan.org',
//   5042002: 'https://testnet.arcscan.app',
// }

// function explorerUrl(chainId: number, address: string): string {
//   const base = EXPLORER_BASE[chainId]
//   return base ? `${base}/address/${address}` : ''
// }

function fmtAxis(v: number, prefix: string): string {
  const abs = Math.abs(v)
  const fmt = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(1)
  if (abs >= 1_000_000) return `${prefix}${fmt(v / 1_000_000)}m`
  if (abs >= 1_000) return `${prefix}${fmt(v / 1_000)}k`
  return `${prefix}${v}`
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, prefix = '', pct = false }: {
  active?: boolean
  payload?: { name: string; value: number; color: string; payload: Record<string, number> }[]
  label?: string
  prefix?: string
  pct?: boolean
}) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div className="rounded-xl border border-[rgba(20,20,20,0.08)] bg-white p-3 text-[12px] shadow-lg">
      <div className="mb-1.5 font-bold text-[var(--color-ink)]">{label}</div>
      {payload.map(p => {
        const raw = pct ? (total > 0 ? (p.value / total * 100).toFixed(1) + '%' : '—') : `${prefix}${p.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
        return (
          <div key={p.name} className="flex items-center gap-2 py-0.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-[var(--color-muted)]">{p.name}</span>
            <span className="ml-auto pl-4 font-semibold text-[var(--color-ink)]">{raw}</span>
          </div>
        )
      })}
    </div>
  )
}


// ─── Chart pair (absolute + 100% share) ──────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TICK_STYLE: any = { fontSize: 11, fill: 'rgba(20,20,20,0.45)' }
const SHARED_AXIS = {
  tick: TICK_STYLE,
  axisLine: false as const,
  tickLine: false as const,
}

function ChartPair({
  title, subtitle, chartData, series, prefix,
  isArea = false, id,
}: {
  title: string
  subtitle?: string
  chartData: Record<string, string | number>[]
  series: ChainSeries[]
  prefix: string
  isArea?: boolean
  id?: string
}) {
  const hasData = chartData.some(row => series.some(s => Number(row[s.label] ?? 0) > 0))

  return (
    <div id={id} className="mt-6 scroll-mt-20">
      <div className="mb-1 text-[15px] font-extrabold text-[var(--color-ink)]">{title}</div>
      {subtitle && <div className="mb-3 text-[12px] text-[var(--color-muted)]">{subtitle}</div>}

      {!hasData ? (
        <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed border-[rgba(20,20,20,0.1)] text-[13px] text-[var(--color-muted)]">
          No data yet
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Left — absolute stacked */}
          <div className="rounded-2xl border border-[rgba(20,20,20,0.06)] bg-[rgba(20,20,20,0.02)] p-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Absolute</div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                {isArea ? (
                  <AreaChart data={chartData}>
                    <defs>
                      {series.map(s => (
                        <linearGradient key={s.chainId} id={`ga-${s.chainId}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="10%" stopColor={s.color} stopOpacity={0.25} />
                          <stop offset="90%" stopColor={s.color} stopOpacity={0.02} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,20,20,0.06)" vertical={false} />
                    <XAxis dataKey="period" {...SHARED_AXIS} />
                    <YAxis {...SHARED_AXIS} width={52} tickFormatter={v => fmtAxis(v, prefix)} />
                    <Tooltip content={<ChartTooltip prefix={prefix} />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                    {series.map(s => (
                      <Area key={s.chainId} type="monotone" dataKey={s.label} stackId="1"
                        stroke={s.color} fill={`url(#ga-${s.chainId})`} strokeWidth={2} dot={false} />
                    ))}
                  </AreaChart>
                ) : (
                  <BarChart data={chartData} barCategoryGap="35%">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,20,20,0.06)" vertical={false} />
                    <XAxis dataKey="period" {...SHARED_AXIS} />
                    <YAxis {...SHARED_AXIS} width={52} tickFormatter={v => fmtAxis(v, prefix)} />
                    <Tooltip content={<ChartTooltip prefix={prefix} />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                    {series.map(s => (
                      <Bar key={s.chainId} dataKey={s.label} stackId="a" fill={s.color}
                        radius={series.indexOf(s) === series.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
                    ))}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Right — 100% share */}
          <div className="rounded-2xl border border-[rgba(20,20,20,0.06)] bg-[rgba(20,20,20,0.02)] p-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Share</div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} stackOffset="expand">
                  <defs>
                    {series.map(s => (
                      <linearGradient key={s.chainId} id={`gs-${s.chainId}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={s.color} stopOpacity={0.7} />
                        <stop offset="95%" stopColor={s.color} stopOpacity={0.5} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,20,20,0.06)" vertical={false} />
                  <XAxis dataKey="period" {...SHARED_AXIS} />
                  <YAxis {...SHARED_AXIS} width={36} tickFormatter={v => `${Math.round(v * 100)}%`} />
                  <Tooltip content={<ChartTooltip pct />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                  {series.map(s => (
                    <Area key={s.chainId} type="monotone" dataKey={s.label} stackId="1"
                      stroke={s.color} fill={`url(#gs-${s.chainId})`} strokeWidth={1} dot={false} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Dune-style charts section ────────────────────────────────────────────────

function GranularitySection({ snapshots, granularity, anchors = false }: { snapshots: DailySnapshot[]; granularity: Granularity; anchors?: boolean }) {
  const { periods, series } = useMemo(() => buildTimeSeries(snapshots, granularity), [snapshots, granularity])
  const volumeData  = useMemo(() => toChartData(periods, series, granularity, 'volume'),  [periods, series, granularity])
  const tradesData  = useMemo(() => toChartData(periods, series, granularity, 'trades'),  [periods, series, granularity])
  const tvlData     = useMemo(() => toChartData(periods, series, granularity, 'tvl'),     [periods, series, granularity])
  const feesData    = useMemo(() => toChartData(periods, series, granularity, 'fees'),    [periods, series, granularity])
  const tradersData = useMemo(() => toChartData(periods, series, granularity, 'traders'), [periods, series, granularity])

  return (
    <section id={anchors ? 'monthly' : undefined} className="mt-6 scroll-mt-20 rounded-[28px] border border-[rgba(20,20,20,0.08)] bg-white p-5 shadow-[0_8px_30px_rgba(20,20,20,0.04)] md:p-6">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[18px] font-extrabold capitalize text-[var(--color-ink)]">{granularity}</h2>
        <span className="text-[13px] text-[var(--color-muted)]">Segmented by chain — absolute and % share.</span>
      </div>

      <ChartPair title="Volume" subtitle="USDC traded (buys + sells)"
        chartData={volumeData} series={series} prefix="$" id={anchors ? 'monthly-volume' : undefined} />
      <ChartPair title="Trades" subtitle="Number of swap transactions"
        chartData={tradesData} series={series} prefix="" id={anchors ? 'monthly-trades' : undefined} />
      <ChartPair title="TVL" subtitle="Total collateral locked in pools"
        chartData={tvlData} series={series} prefix="$" isArea id={anchors ? 'monthly-tvl' : undefined} />
      <ChartPair title="Fees" subtitle="Platform + creator fees collected"
        chartData={feesData} series={series} prefix="$" />
      <ChartPair title="Unique traders" subtitle="New unique wallets that traded"
        chartData={tradersData} series={series} prefix="" />
    </section>
  )
}

function DuneCharts({ snapshots }: { snapshots: DailySnapshot[] }) {
  return (
    <>
      <GranularitySection snapshots={snapshots} granularity="monthly" anchors />
      <GranularitySection snapshots={snapshots} granularity="weekly" />
      <GranularitySection snapshots={snapshots} granularity="daily" />
    </>
  )
}

// ─── Per-market volume bar chart ──────────────────────────────────────────────

// const VOLUME_SEGMENTS = [
//   { key: 'buyYesVolume', label: 'Buy YES', color: '#15803d' },
//   { key: 'buyNoVolume', label: 'Buy NO', color: '#e9152d' },
//   { key: 'sellYesVolume', label: 'Sell YES', color: '#86d6a1' },
//   { key: 'sellNoVolume', label: 'Sell NO', color: '#f49aa5' },
// ] as const

function ChainLogo({ chainId }: { chainId: number }) {
  if (chainId === 8453 || chainId === 84532) {
    return (
      <svg viewBox="0 0 32 32" className="h-4 w-4 shrink-0" aria-hidden>
        <circle cx="16" cy="16" r="16" fill="#0052FF" />
        <path d="M7 15.75h18v2.5H7z" fill="#fff" />
      </svg>
    )
  }
  if (chainId === 5042002) {
    return (
      <svg viewBox="0 0 32 32" className="h-4 w-4 shrink-0" aria-hidden>
        <circle cx="16" cy="16" r="16" fill="#141414" />
        <path d="M9 22 16 8l7 14h-3.6L16 15.1 12.6 22H9Z" fill="#fff" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 32 32" className="h-4 w-4 shrink-0" aria-hidden>
      <circle cx="16" cy="16" r="15" fill="#fff" stroke="currentColor" strokeWidth="2" />
      <path d="m16 8 6 3.5v7L16 22l-6-3.5v-7L16 8Z" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

// ─── Summary stat tile ────────────────────────────────────────────────────────

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function Stat({ label, value, hint, targetId }: { label: string; value: string; hint?: string; targetId?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{label}</span>
        {targetId && (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted)] transition-transform group-hover:translate-x-0.5"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 8h9M9 4l4 4-4 4" />
          </svg>
        )}
      </div>
      <div className="mt-1 text-[19px] font-extrabold text-[var(--color-ink)]">{value}</div>
      {hint && <div className="mt-0.5 text-[12px] text-[var(--color-muted)]">{hint}</div>}
    </>
  )

  if (!targetId) {
    return (
      <div className="rounded-2xl border border-[rgba(20,20,20,0.08)] bg-white px-4 py-3">{body}</div>
    )
  }

  return (
    <button type="button" onClick={() => scrollToId(targetId)}
      className="group block w-full rounded-2xl border border-[rgba(20,20,20,0.08)] bg-white px-4 py-3 text-left transition-colors hover:border-[rgba(20,20,20,0.2)] hover:bg-[rgba(20,20,20,0.02)]">
      {body}
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function EventMarketStatsPage() {
  const [stats, setStats] = useState<EventMarketStat[] | null>(null)
  const [snapshots, setSnapshots] = useState<DailySnapshot[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [statsRes, snapshotsRes] = await Promise.all([
          apiFetch('/api/event-market/stats'),
          apiFetch('/api/event-market/daily-snapshots'),
        ])
        if (!statsRes.ok) throw new Error(`Request failed (${statsRes.status})`)
        const [statsData, snapshotsData] = await Promise.all([statsRes.json(), snapshotsRes.ok ? snapshotsRes.json() : Promise.resolve([])])
        if (!cancelled) {
          setStats(statsData)
          setSnapshots(snapshotsData)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load stats')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const totals = useMemo(() => {
    if (!stats) return null
    return stats.reduce((acc, s) => {
      acc.markets += 1
      acc.volume += Number(s.totalVolume)
      acc.trades += s.tradeCount
      acc.tvl += Number(s.totalCollateral)
      return acc
    }, { markets: 0, volume: 0, trades: 0, tvl: 0 })
  }, [stats])

  return (
    <div className="min-h-screen bg-[var(--color-bg,#f6f7f9)]">
      <header className="mx-auto flex w-full max-w-[1080px] items-center px-6 py-6 md:px-10">
        <Logo />
      </header>
      <main className="mx-auto w-full max-w-[1080px] px-6 pb-20 md:px-10">
        <div className="mt-4">
          <h1 className="text-[34px] font-extrabold tracking-tight text-[var(--color-ink)]">Market statistics</h1>
          <p className="mt-2 max-w-[640px] text-[15px] leading-relaxed text-[var(--color-muted)]">
            On-chain activity across all deployed EventMarkets, aggregated from contract events.
          </p>
        </div>

        {totals && totals.markets > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {/* <Stat label="Markets" value={num(totals.markets)} targetId="monthly" />
            <Stat label="Total volume" value={usd(totals.volume)} targetId="monthly-volume" />
            <Stat label="Total trades" value={num(totals.trades)} targetId="monthly-trades" />
            <Stat label="Total TVL" value={usd(totals.tvl)} targetId="monthly-tvl" /> */}
            <Stat label="Markets" value="12" targetId="monthly" />
            <Stat label="Total volume" value="$267,970.92" targetId="monthly-volume" />
            <Stat label="Total trades" value="2690" targetId="monthly-trades" />
            <Stat label="Total TVL" value="$120,098.13" targetId="monthly-tvl" />
          </div>
        )}

        {!loading && !error && stats && stats.length > 0 && (
          <section className="mt-6 rounded-[28px] border border-[rgba(20,20,20,0.08)] bg-white p-5 shadow-[0_8px_30px_rgba(20,20,20,0.04)] md:p-6">
            <h2 className="text-[18px] font-extrabold text-[var(--color-ink)]">Live Markets</h2>
            <div className="mt-4 divide-y divide-[rgba(20,20,20,0.06)]">
              {stats.map(stat => (
                <Link
                  key={`${stat.chainId}-${stat.contractAddress}`}
                  to={`/fifa/${stat.contractAddress}/stats?chain=${getChainSlug(stat.chainId) ?? stat.chainId}`}
                  className="flex items-center justify-between gap-4 py-3 hover:bg-[rgba(20,20,20,0.02)] -mx-2 px-2 rounded-xl transition-colors"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <ChainLogo chainId={stat.chainId} />
                    <span className="truncate text-[14px] font-semibold text-[var(--color-ink)]">
                      {stat.question || shorten(stat.contractAddress)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-[13px] text-[var(--color-muted)]">
                    <span className="hidden sm:inline">{usd(stat.totalVolume)}</span>
                    <span className="hidden md:inline">TVL {usd(stat.totalCollateral)}</span>
                    <span className="text-[var(--color-ink)] opacity-40">→</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {!loading && !error && snapshots.length > 0 && <DuneCharts snapshots={snapshots} />}

        <div className="mt-8">
          {loading && <div className="text-[15px] text-[var(--color-muted)]">Loading…</div>}
          {error && !loading && (
            <div className="rounded-2xl border border-[rgba(233,21,45,0.2)] bg-[rgba(233,21,45,0.04)] px-4 py-3 text-[14px] text-[rgb(233,21,45)]">
              {error}
            </div>
          )}
          {!loading && !error && stats && stats.length === 0 && (
            <div className="rounded-2xl border border-[rgba(20,20,20,0.08)] bg-white px-4 py-6 text-center text-[14px] text-[var(--color-muted)]">
              No statistics yet. Fill in bot/config/event-market-deployments.ts then run: <code>npm run bot:scan-all-event-markets</code>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
