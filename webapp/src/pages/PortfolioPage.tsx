import { useCallback, useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { SiteNav } from '@/components/SiteNav'
import { ConnectWallet } from '@/components/ConnectWallet'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/api'

type PortfolioPosition = {
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
  totalValue: number
  invested: number
  pnl: number
  roiPct: number | null
}

type Portfolio = {
  address: string
  totalValue: number
  positions: PortfolioPosition[]
  referral: {
    code: string
    inviteUrl: string
    connectedWallets: number
    tradingUsers: number
    tradeCount: number
    totalVolumeUsdc: number
    totalFeeUsdc: number
    totalRewardUsdc: number
    pendingRewardUsdc: number
  }
}

const usd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`

// Signed USD, e.g. "+$0.0600" / "-$1.2000" — for P&L amounts.
const signedUsd = (n: number) =>
  `${n < 0 ? '-' : '+'}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })}`

// Signed percentage, e.g. "+3.2%" / "-12.0%".
const signedPct = (n: number) =>
  `${n < 0 ? '' : '+'}${n.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`

const GAIN = '#00994d'
const LOSS = '#e34948'

const tokens = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 4 })

function StatusBadge({ label }: { label: string }) {
  const tone =
    label === 'Open'
      ? 'bg-[rgba(0,200,83,0.12)] text-[#00994d]'
      : label === 'Settled'
        ? 'bg-[rgba(20,20,20,0.08)] text-[var(--color-ink)]'
        : 'bg-[rgba(255,153,0,0.14)] text-[var(--color-orange)]'
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>
  )
}

function PositionCard({ p }: { p: PortfolioPosition }) {
  return (
    <div className="rounded-[26px] border border-[rgba(20,20,20,0.12)] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold leading-snug tracking-[-0.01em]">{p.question}</h3>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {p.chainLabel}
            {p.match ? ` · ${p.match}` : ''}
          </p>
        </div>
        <StatusBadge label={p.statusLabel} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-[rgba(255,204,0,0.12)] p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">YES</p>
          <p className="mt-1 text-sm font-semibold">{tokens(p.yesTokens)} tokens</p>
          <p className="text-xs text-[var(--color-muted)]">{usd(p.yesValue)}</p>
        </div>
        <div className="rounded-2xl bg-[rgba(0,82,255,0.08)] p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">NO</p>
          <p className="mt-1 text-sm font-semibold">{tokens(p.noTokens)} tokens</p>
          <p className="text-xs text-[var(--color-muted)]">{usd(p.noValue)}</p>
        </div>
      </div>

      {p.lpShares > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-[rgba(20,20,20,0.04)] px-3 py-2.5">
          <span className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">LP position</span>
          <span className="text-sm font-semibold">{usd(p.lpValue)}</span>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-[rgba(20,20,20,0.08)] pt-3">
        <div>
          <p className="text-xs text-[var(--color-muted)]">Est. value</p>
          <p className="text-lg font-semibold tracking-[-0.01em]">{usd(p.totalValue)}</p>
        </div>
        {p.claimable > 0 && (
          <div className="text-right">
            <p className="text-xs text-[var(--color-muted)]">Claimable</p>
            <p className="text-sm font-semibold text-[#00994d]">{usd(p.claimable)}</p>
          </div>
        )}
      </div>

      {p.roiPct !== null && (
        <div className="mt-3 grid grid-cols-3 gap-3 rounded-2xl bg-[rgba(20,20,20,0.03)] px-3 py-2.5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">Invested</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">{usd(p.invested)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">P&amp;L</p>
            <p
              className="mt-0.5 text-sm font-semibold tabular-nums"
              style={{ color: p.pnl >= 0 ? GAIN : LOSS }}
            >
              {signedUsd(p.pnl)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">Return</p>
            <p
              className="mt-0.5 text-sm font-semibold tabular-nums"
              style={{ color: p.roiPct >= 0 ? GAIN : LOSS }}
            >
              {signedPct(p.roiPct)}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export function PortfolioPage() {
  const { isConnected } = useAccount()
  const { isAuthenticated, isSigningIn, signIn } = useAuth()

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/portfolio')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Request failed (${res.status})`)
      }
      setPortfolio(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load portfolio')
    } finally {
      setLoading(false)
    }
  }, [])

  const copyInviteLink = useCallback(async () => {
    if (!portfolio?.referral.inviteUrl) return
    await navigator.clipboard.writeText(portfolio.referral.inviteUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }, [portfolio?.referral.inviteUrl])

  useEffect(() => {
    if (isAuthenticated) void load()
    else setPortfolio(null)
  }, [isAuthenticated, load])

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-bg-0)] text-[var(--color-ink)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,82,255,0.08),transparent_24%),radial-gradient(circle_at_85%_20%,rgba(0,82,255,0.06),transparent_18%)]" />
      <SiteNav />
      <div className="relative mx-auto max-w-4xl px-6 pb-16 md:px-10">
        <section className="mt-6">
          <h1 className="text-3xl font-semibold tracking-[-0.02em] md:text-4xl">Your portfolio</h1>
          <p className="mt-3 max-w-[640px] text-base leading-7 text-[var(--color-muted)]">
            Positions across every FIFA market you hold, on all supported chains. Values are
            estimates — marked to market while a market is live, and to the redeemable payout
            once it settles.
          </p>
        </section>

        {/* Not connected / not signed in */}
        {!isConnected ? (
          <div className="mt-10 rounded-[26px] border border-[rgba(20,20,20,0.12)] bg-white p-8 text-center">
            <p className="text-sm text-[var(--color-muted)]">Connect your wallet to view your portfolio.</p>
            <div className="mt-5 flex justify-center">
              <ConnectWallet />
            </div>
          </div>
        ) : !isAuthenticated ? (
          <div className="mt-10 rounded-[26px] border border-[rgba(20,20,20,0.12)] bg-white p-8 text-center">
            <p className="text-sm text-[var(--color-muted)]">
              Sign in with your wallet to load your portfolio.
            </p>
            <button
              onClick={signIn}
              disabled={isSigningIn}
              className="mt-5 rounded-full bg-[var(--color-cyan)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {isSigningIn ? 'Signing…' : 'Sign In'}
            </button>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="mt-8 rounded-[26px] border border-[rgba(0,82,255,0.25)] bg-gradient-to-br from-[rgba(0,82,255,0.06)] to-white p-6">
              <p className="text-xs uppercase tracking-[0.2em] text-[#007AFF]">Total estimated value</p>
              <p className="mt-2 text-4xl font-semibold tracking-[-0.02em]">
                {portfolio ? usd(portfolio.totalValue) : loading ? '…' : '$0.0000'}
              </p>
            </div>

            {portfolio && (
              <section className="mt-5 rounded-[26px] border border-[rgba(20,20,20,0.12)] bg-white p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[#007AFF]">Referral rewards</p>
                    <p className="mt-2 text-3xl font-semibold tracking-[-0.02em]">
                      {usd(portfolio.referral.pendingRewardUsdc)}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">
                      10% of invited users' trading fees.
                    </p>
                  </div>
                  <div className="min-w-0 md:max-w-[360px] md:text-right">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">
                      Code {portfolio.referral.code}
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-[var(--color-cyan)]">
                      {portfolio.referral.inviteUrl}
                    </p>
                    <button
                      onClick={copyInviteLink}
                      className="mt-3 rounded-full bg-[var(--color-cyan)] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90"
                    >
                      {copied ? 'Copied' : 'Copy link'}
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-2xl bg-[rgba(20,20,20,0.04)] p-3">
                    <p className="text-xs text-[var(--color-muted)]">Connected wallets</p>
                    <p className="mt-1 text-lg font-semibold">{portfolio.referral.connectedWallets}</p>
                  </div>
                  <div className="rounded-2xl bg-[rgba(20,20,20,0.04)] p-3">
                    <p className="text-xs text-[var(--color-muted)]">Trading users</p>
                    <p className="mt-1 text-lg font-semibold">{portfolio.referral.tradingUsers}</p>
                  </div>
                  <div className="rounded-2xl bg-[rgba(20,20,20,0.04)] p-3">
                    <p className="text-xs text-[var(--color-muted)]">Referral volume</p>
                    <p className="mt-1 text-lg font-semibold">{usd(portfolio.referral.totalVolumeUsdc)}</p>
                  </div>
                  <div className="rounded-2xl bg-[rgba(20,20,20,0.04)] p-3">
                    <p className="text-xs text-[var(--color-muted)]">Trades</p>
                    <p className="mt-1 text-lg font-semibold">{portfolio.referral.tradeCount}</p>
                  </div>
                </div>
              </section>
            )}

            {error && (
              <div className="mt-6 rounded-2xl border border-[rgba(255,100,0,0.2)] bg-[rgba(255,100,0,0.05)] p-4 text-sm text-[var(--color-orange)]">
                {error}
                <button onClick={() => void load()} className="ml-3 font-semibold underline">
                  Retry
                </button>
              </div>
            )}

            {loading && !portfolio && (
              <p className="mt-8 text-sm text-[var(--color-muted)]">Loading positions…</p>
            )}

            {portfolio && portfolio.positions.length === 0 && !loading && (
              <div className="mt-8 rounded-[26px] border border-[rgba(20,20,20,0.12)] bg-white p-8 text-center text-sm text-[var(--color-muted)]">
                No positions yet. Head to Explore to place your first bet.
              </div>
            )}

            {portfolio && portfolio.positions.length > 0 && (
              <div className="mt-8 grid gap-5 md:grid-cols-2">
                {portfolio.positions.map((p) => (
                  <PositionCard key={`${p.chainId}-${p.address}`} p={p} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
