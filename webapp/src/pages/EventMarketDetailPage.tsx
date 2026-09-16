import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { apiFetch } from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

type EventMarketStat = {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CHAIN_LABELS: Record<number, string> = {
  84532: 'Base Sepolia',
  8453: 'Base',
  5042002: 'Arc Testnet',
  97: 'BSC Testnet',
}

const CHAIN_COLORS: Record<number, string> = {
  84532: '#0052FF',
  8453: '#0041CC',
  5042002: '#8b5cf6',
  97: '#FCD535',
}

const CHAIN_ID_BY_SLUG: Record<string, number> = {
  'base-sepolia': 84532,
  'base': 8453,
  'arc-testnet': 5042002,
  'bsc-testnet': 97,
}

const EXPLORER_BASE: Record<number, string> = {
  84532: 'https://sepolia.basescan.org',
  8453: 'https://basescan.org',
  5042002: 'https://testnet.arcscan.app',
  97: 'https://testnet.bscscan.com',
}

function explorerUrl(chainId: number, address: string): string {
  const base = EXPLORER_BASE[chainId]
  return base ? `${base}/address/${address}` : ''
}

function usd(v: string | number, decimals = 2): string {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return '$0'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

function num(v: number | string): string {
  return Number(v).toLocaleString('en-US')
}

function pct(v: number): string {
  return `${v.toFixed(1)}%`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

function shorten(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
  if (chainId === 97) {
    return (
      <svg viewBox="0 0 32 32" className="h-4 w-4 shrink-0" aria-hidden>
        <circle cx="16" cy="16" r="16" fill="#F3BA2F" />
        <path d="m16 9 2.2 2.3-3.6 3.6L12.4 18 16 21.6 19.6 18l2.2 2.3L16 26l-7-7 7-7Zm5 5 1.6 1.6L21 17.2 19.4 15.6 21 14Zm-10 0 1.6 1.6L11 17.2 9.4 15.6 11 14Z" fill="#fff" />
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

function Stat({ label, value, hint, wide }: { label: string; value: string; hint?: string; wide?: boolean }) {
  return (
    <div className={`rounded-2xl border border-[rgba(20,20,20,0.08)] bg-white px-4 py-3 ${wide ? 'col-span-2' : ''}`}>
      <div className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className="mt-1 text-[18px] font-extrabold text-[var(--color-ink)]">{value}</div>
      {hint && <div className="mt-0.5 text-[12px] text-[var(--color-muted)]">{hint}</div>}
    </div>
  )
}

function OddsBar({ yesPct, noPct }: { yesPct: number; noPct: number }) {
  return (
    <div className="mt-4">
      <div className="flex justify-between text-[12px] font-bold">
        <span style={{ color: '#15803d' }}>YES {pct(yesPct)}</span>
        <span style={{ color: '#e9152d' }}>NO {pct(noPct)}</span>
      </div>
      <div className="mt-1.5 flex h-3 w-full overflow-hidden rounded-full bg-[rgba(20,20,20,0.08)]">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${yesPct}%`, backgroundColor: '#15803d' }} />
        <div className="h-full flex-1 rounded-full" style={{ backgroundColor: '#e9152d' }} />
      </div>
    </div>
  )
}

const STATUS_LABELS: Record<number, string> = {
  0: 'Open',
  1: 'Betting closed',
  2: 'Resolvable',
  3: 'Resolved',
  4: 'Cancelled',
}

const STATUS_COLORS: Record<number, string> = {
  0: 'bg-[rgba(21,128,61,0.1)] text-[#15803d]',
  1: 'bg-[rgba(202,138,4,0.1)] text-[#a16207]',
  2: 'bg-[rgba(59,130,246,0.1)] text-[#1d4ed8]',
  3: 'bg-[rgba(20,20,20,0.08)] text-[var(--color-muted)]',
  4: 'bg-[rgba(233,21,45,0.08)] text-[rgb(233,21,45)]',
}

function StatusBadge({ status, yesWins, isDraw }: { status: number; yesWins: boolean; isDraw: boolean }) {
  const isSettled = status === 3
  const label = isSettled
    ? (isDraw ? 'Draw' : yesWins ? 'YES wins' : 'NO wins')
    : (STATUS_LABELS[status] ?? `Status ${status}`)
  const cls = isSettled
    ? (isDraw ? STATUS_COLORS[3] : yesWins ? 'bg-[rgba(21,128,61,0.1)] text-[#15803d]' : 'bg-[rgba(233,21,45,0.08)] text-[rgb(233,21,45)]')
    : (STATUS_COLORS[status] ?? STATUS_COLORS[3])
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${cls}`}>
      {label}
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function EventMarketDetailPage() {
  const { contractAddress } = useParams<{ contractAddress: string }>()
  const [searchParams] = useSearchParams()
  const chainSlug = searchParams.get('chain') ?? ''
  const chainId = CHAIN_ID_BY_SLUG[chainSlug]

  const [stat, setStat] = useState<EventMarketStat | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!contractAddress || !chainId) {
      setError(!contractAddress ? 'Missing contract address.' : `Unknown chain "${chainSlug}".`)
      setLoading(false)
      return
    }
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await apiFetch(`/api/event-market/stats/${chainId}/${contractAddress}`)
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        const data = await res.json()
        if (!cancelled) setStat(data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load stats')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [contractAddress, chainId, chainSlug])

  const backLink = contractAddress ? `/fifa/${contractAddress}?chain=${chainSlug}` : '/'
  const chainColor = chainId ? (CHAIN_COLORS[chainId] ?? '#888') : '#888'

  // Backend stores yesProbability as a 0–1 fraction (noReserve / (yesReserve + noReserve)).
  const yesPct = stat ? Number(stat.yesProbability) * 100 : 50
  const noPct  = 100 - yesPct

  return (
    <div className="min-h-screen bg-[var(--color-bg,#f6f7f9)]">
      <header className="mx-auto flex w-full max-w-[800px] items-center px-6 py-6 md:px-10">
        <Logo />
      </header>
      <main className="mx-auto w-full max-w-[800px] px-6 pb-20 md:px-10">
        <div className="mt-2">
          <Link to={backLink}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-muted)] hover:text-[var(--color-ink)]">
            <span aria-hidden>←</span> Back to market
          </Link>
        </div>

        {loading && (
          <div className="mt-8 text-[15px] text-[var(--color-muted)]">Loading…</div>
        )}
        {error && !loading && (
          <div className="mt-8 rounded-2xl border border-[rgba(233,21,45,0.2)] bg-[rgba(233,21,45,0.04)] px-4 py-3 text-[14px] text-[rgb(233,21,45)]">
            {error}
          </div>
        )}

        {!loading && !error && stat && (
          <>
            {/* Header */}
            <div className="mt-5 rounded-[28px] border border-[rgba(20,20,20,0.08)] bg-white p-5 shadow-[0_8px_30px_rgba(20,20,20,0.04)] md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <ChainLogo chainId={stat.chainId} />
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{ backgroundColor: `${chainColor}18`, color: chainColor }}>
                      {CHAIN_LABELS[stat.chainId] ?? `Chain ${stat.chainId}`}
                    </span>
                    <StatusBadge status={stat.status} yesWins={stat.yesWins} isDraw={stat.isDraw} />
                    {explorerUrl(stat.chainId, stat.contractAddress) && (
                      <a href={explorerUrl(stat.chainId, stat.contractAddress)}
                        target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-[rgba(20,20,20,0.12)] bg-[rgba(20,20,20,0.04)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-muted)] hover:border-[rgba(20,20,20,0.2)] hover:text-[var(--color-ink)]">
                        View on explorer
                        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M2 10 10 2M5 2h5v5" />
                        </svg>
                      </a>
                    )}
                  </div>
                  <h1 className="mt-3 text-[20px] font-extrabold leading-snug text-[var(--color-ink)]">
                    {stat.question ?? shorten(stat.contractAddress)}
                  </h1>
                  {stat.resolutionSource && (
                    <p className="mt-1 text-[13px] text-[var(--color-muted)]">
                      Source: {stat.resolutionSource}
                    </p>
                  )}
                </div>
              </div>

              <OddsBar yesPct={yesPct} noPct={noPct} />

              <div className="mt-4 grid grid-cols-2 gap-2 text-[12px] text-[var(--color-muted)] sm:grid-cols-4">
                <div>
                  <div className="font-semibold uppercase tracking-wide">Betting closes</div>
                  <div className="mt-0.5 font-bold text-[var(--color-ink)]">{fmtDate(stat.bettingDeadline)}</div>
                </div>
                <div>
                  <div className="font-semibold uppercase tracking-wide">Resolvable after</div>
                  <div className="mt-0.5 font-bold text-[var(--color-ink)]">{fmtDate(stat.resolveAfter)}</div>
                </div>
                <div>
                  <div className="font-semibold uppercase tracking-wide">Contract</div>
                  {explorerUrl(stat.chainId, stat.contractAddress) ? (
                    <a href={explorerUrl(stat.chainId, stat.contractAddress)}
                      target="_blank" rel="noopener noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 font-mono font-bold text-[var(--color-ink)] underline-offset-2 hover:underline">
                      {shorten(stat.contractAddress)}
                      <svg viewBox="0 0 12 12" className="h-3 w-3 opacity-50" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M2 10 10 2M5 2h5v5" />
                      </svg>
                    </a>
                  ) : (
                    <div className="mt-0.5 font-mono font-bold text-[var(--color-ink)]">{shorten(stat.contractAddress)}</div>
                  )}
                </div>
                <div>
                  <div className="font-semibold uppercase tracking-wide">Last scan</div>
                  <div className="mt-0.5 font-bold text-[var(--color-ink)]">{fmtDate(stat.scannedAt)}</div>
                </div>
              </div>
            </div>

            {/* Volume */}
            <section className="mt-6 rounded-[28px] border border-[rgba(20,20,20,0.08)] bg-white p-5 shadow-[0_8px_30px_rgba(20,20,20,0.04)] md:p-6">
              <h2 className="text-[16px] font-extrabold text-[var(--color-ink)]">Volume & trades</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Total volume" value={usd(stat.totalVolume)} />
                <Stat label="Total trades" value={num(stat.tradeCount)} />
                <Stat label="Unique traders" value={num(stat.uniqueTraders)} />
                <Stat label="TVL" value={usd(stat.totalCollateral)} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Buy YES vol" value={usd(stat.buyYesVolume)} hint={`${num(stat.buyYesCount)} trades`} />
                <Stat label="Buy NO vol" value={usd(stat.buyNoVolume)} hint={`${num(stat.buyNoCount)} trades`} />
                <Stat label="Sell YES vol" value={usd(stat.sellYesVolume)} hint={`${num(stat.sellYesCount)} trades`} />
                <Stat label="Sell NO vol" value={usd(stat.sellNoVolume)} hint={`${num(stat.sellNoCount)} trades`} />
              </div>
            </section>

            {/* Liquidity */}
            <section className="mt-6 rounded-[28px] border border-[rgba(20,20,20,0.08)] bg-white p-5 shadow-[0_8px_30px_rgba(20,20,20,0.04)] md:p-6">
              <h2 className="text-[16px] font-extrabold text-[var(--color-ink)]">Liquidity</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="YES reserve" value={usd(stat.yesReserve)} />
                <Stat label="NO reserve" value={usd(stat.noReserve)} />
                <Stat label="Total LP shares" value={num(stat.totalLpShares)} />
                <Stat label="Unique LPs" value={num(stat.uniqueLps)} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Liquidity added" value={usd(stat.totalLiquidityAdded)} hint={`${num(stat.liquidityAddedCount)} txns`} />
                <Stat label="Liquidity removed" value={usd(stat.totalLiquidityRemoved)} hint={`${num(stat.liquidityRemovedCount)} txns`} />
                <Stat label="Platform fee" value={usd(stat.platformFee)} />
                <Stat label="Creator fee" value={usd(stat.creatorFee)} />
              </div>
            </section>

            {/* Settlement */}
            <section className="mt-6 rounded-[28px] border border-[rgba(20,20,20,0.08)] bg-white p-5 shadow-[0_8px_30px_rgba(20,20,20,0.04)] md:p-6">
              <h2 className="text-[16px] font-extrabold text-[var(--color-ink)]">Settlement & redemption</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Pair redeems" value={num(stat.pairRedeemCount)} hint={`${usd(stat.pairRedeemVolume)} redeemed`} />
                <Stat label="Winner redeems" value={num(stat.redeemCount)} hint={`${usd(stat.redeemPayout)} paid`} />
                <Stat label="LP claims" value={num(stat.lpClaimCount)} hint={`${usd(stat.lpClaimPayout)} paid`} />
                <Stat label="Block height" value={num(stat.lastScannedBlock)} hint="last scanned" />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
