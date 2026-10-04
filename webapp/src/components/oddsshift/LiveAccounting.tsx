import { CountUp } from '@/components/oddsshift/CountUp'
import { LIVE_ACCOUNTING, LIVE_MARKET } from '@/data/robinhoodLiveEvidence'
import type { RobinhoodLiveState } from '@/hooks/useRobinhoodLiveState'

function Metric({
  label,
  value,
  decimals = 0,
  suffix = '',
  tone,
}: {
  label: string
  value: number
  decimals?: number
  suffix?: string
  tone?: 'accent' | 'ok' | 'bad'
}) {
  return (
    <div className={`rh-metric${tone ? ` rh-metric-${tone}` : ''}`}>
      <div className="rh-metric-v" aria-label={`${label}: ${value}${suffix}`}>
        <CountUp value={value} decimals={decimals} suffix={suffix} />
      </div>
      <div className="rh-metric-k">{label}</div>
    </div>
  )
}

export function LiveAccounting({ live }: { live: RobinhoodLiveState }) {
  const trades = live.totalTrades ?? LIVE_ACCOUNTING.totalTrades
  const shocks = live.totalShocks ?? LIVE_ACCOUNTING.totalShocks
  const pending = live.unavailable ? LIVE_ACCOUNTING.pendingTrades : (live.pendingCount ?? LIVE_ACCOUNTING.pendingTrades)
  const prob =
    live.currentProbPercent ?? LIVE_MARKET.finalProbabilityPercent

  // Lifetime economics are immutable demo results; prefer evidence constants so
  // narration stays exact even if RPC formatting differs slightly.
  const refunded = Number(LIVE_ACCOUNTING.protectionRefundedUsdg)
  const toxic = Number(LIVE_ACCOUNTING.toxicProtectionToLpsUsdg)
  const base = Number(LIVE_ACCOUNTING.baseFeesToLpsUsdg)
  const lp = Number(LIVE_ACCOUNTING.totalLpPayoutUsdg)

  const pendingEscrow = live.unavailable
    ? LIVE_ACCOUNTING.pendingEscrowUsdg
    : (live.pendingEscrowUsdg ?? LIVE_ACCOUNTING.pendingEscrowUsdg)
  const rebates = live.unavailable
    ? LIVE_ACCOUNTING.traderRebatesOwedUsdg
    : (live.rebateOwedUsdg ?? LIVE_ACCOUNTING.traderRebatesOwedUsdg)
  const lpOwed = live.unavailable
    ? LIVE_ACCOUNTING.lpRewardsOwedUsdg
    : (live.lpRewardOwedUsdg ?? LIVE_ACCOUNTING.lpRewardsOwedUsdg)

  return (
    <section className="rh-card" aria-labelledby="rh-accounting-title">
      <div className="rh-card-head">
        <div>
          <p className="rh-card-title" id="rh-accounting-title">
            Live accounting
          </p>
          <h2 className="rh-card-h">What the settled demo produced</h2>
          <p className="rh-card-sub">
            Headline counters refresh from the live contract when RPC is available. Lifetime fee
            totals below are the verified settled-demo accounting.
          </p>
        </div>
        {live.unavailable && (
          <div className="rh-status-warn" role="status">
            Live state temporarily unavailable
          </div>
        )}
        {live.loading && !live.unavailable && (
          <div className="rh-status-warn" role="status">
            Loading live state…
          </div>
        )}
      </div>

      <div className="rh-metrics">
        <Metric label="Trades" value={trades} />
        <Metric label="Shocks" value={shocks} />
        <Metric label="Pending" value={pending} tone="ok" />
        <Metric label="Final YES probability" value={prob} decimals={2} suffix="%" tone="accent" />
        <Metric label="Protection refunded" value={refunded} decimals={6} suffix=" USDG" tone="ok" />
        <Metric
          label="Toxic protection → LPs"
          value={toxic}
          decimals={6}
          suffix=" USDG"
          tone="bad"
        />
        <Metric label="Base fees → LPs" value={base} decimals={6} suffix=" USDG" />
        <Metric label="Total LP payout" value={lp} decimals={6} suffix=" USDG" tone="accent" />
      </div>

      <div className="rh-zero" aria-label="Zero liability status">
        <div className="rh-zero-item">
          <div className="rh-zero-v">{pending}</div>
          <div className="rh-zero-k">Pending trades</div>
        </div>
        <div className="rh-zero-item">
          <div className="rh-zero-v">{pendingEscrow}</div>
          <div className="rh-zero-k">Pending escrow</div>
        </div>
        <div className="rh-zero-item">
          <div className="rh-zero-v">{rebates}</div>
          <div className="rh-zero-k">Trader rebates owed</div>
        </div>
        <div className="rh-zero-item">
          <div className="rh-zero-v">{lpOwed}</div>
          <div className="rh-zero-k">LP rewards owed</div>
        </div>
      </div>
    </section>
  )
}
