import { Link } from 'react-router-dom'
import { useReadContract } from 'wagmi'
import { SiteNav } from '@/components/SiteNav'
import { InfoTooltip } from '@/components/InfoTooltip'
import { ChampionHistoryChart } from '@/components/ChampionHistoryChart'
import { EVENT_MARKET_ABI } from '@/config/contracts'
import { getChainIdBySlug } from '@/config/chains'
import { formatProbability } from '@/lib/utils'
import { CRYPTO_MARKETS, cryptoLink, type CryptoMarket } from '@/data/cryptoPolicy'

// Dedicated "Crypto policy" page — YES/NO markets on US digital-asset
// legislation. Styled after MidtermMarketsPage; a card is LIVE the moment an
// address is filled in cryptoPolicy.ts and renders as a SOON preview until then.

// Live YES/NO split bar — reads the market's on-chain yesProbability.
function FeaturedOddsBar({ address, chainSlug }: { address: `0x${string}`; chainSlug: string }) {
  const chainId = getChainIdBySlug(chainSlug) ?? 0
  const { data: yesProb } = useReadContract({
    address,
    abi: EVENT_MARKET_ABI,
    functionName: 'yesProbability',
    chainId,
  })
  // Matches the Fed / midterm pages: render the live on-chain split, defaulting
  // to an even 50/50 only while the first read is in flight.
  const yesPct = yesProb !== undefined ? Number(formatProbability(yesProb as bigint)) : 50
  const noPct = Math.round((100 - yesPct) * 100) / 100
  return (
    <div className="mt-5 flex items-center gap-3">
      <span className="whitespace-nowrap text-sm font-bold text-[#15803d]">YES {yesPct}%</span>
      <div className="h-[9px] w-full overflow-hidden rounded-full bg-[rgba(233,21,45,0.12)]">
        <div
          className="h-full rounded-full bg-[#15803d]"
          style={{ width: `${Math.min(100, Math.max(0, yesPct))}%` }}
        />
      </div>
      <span className="whitespace-nowrap text-sm font-bold text-[rgb(233,21,45)]">NO {noPct}%</span>
    </div>
  )
}

// Static 50/50 bar for markets that aren't deployed yet (addresses still blank).
function NeutralOddsBar() {
  return (
    <div className="mt-5 flex items-center gap-3">
      <span className="whitespace-nowrap text-sm font-bold text-[var(--color-muted)]">YES —</span>
      <div className="h-[9px] w-full overflow-hidden rounded-full bg-[rgba(20,20,20,0.08)]">
        <div className="h-full w-1/2 rounded-full bg-[rgba(20,20,20,0.18)]" />
      </div>
      <span className="whitespace-nowrap text-sm font-bold text-[var(--color-muted)]">NO —</span>
    </div>
  )
}

// Reads the market's on-chain resolutionSource and exposes it as a hover tooltip.
function ResolutionSourceTip({ address, chainSlug }: { address: `0x${string}`; chainSlug: string }) {
  const chainId = getChainIdBySlug(chainSlug) ?? 0
  const { data: source } = useReadContract({
    address,
    abi: EVENT_MARKET_ABI,
    functionName: 'resolutionSource',
    chainId,
  })
  return <InfoTooltip text={(source as string | undefined) ?? ''} label="Resolution rules" className="ml-[4px]" />
}

function closesLabel(unix: number): string {
  // Stable, locale-independent UTC label so the schedule reads the same anywhere.
  const d = new Date(unix * 1000)
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
  return `${date} · ${time} UTC`
}

function CryptoCard({ m }: { m: CryptoMarket }) {
  const link = cryptoLink(m)

  const badge = link ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(0,122,255,0.12)] px-2.5 py-1 text-[#0052CC]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#0052CC]" /> LIVE NOW
    </span>
  ) : (
    <span className="rounded-full bg-[rgba(20,20,20,0.05)] px-2.5 py-1 text-[var(--color-muted)]">SOON</span>
  )

  const inner = (
    <>
      <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#007AFF]">
        {badge}
        <span>{m.topic} · US policy</span>
      </div>
      <div className="mt-6 text-center text-lg font-semibold tracking-[-0.01em] md:text-xl">
        {m.question}
        {link && <ResolutionSourceTip address={link.address} chainSlug={link.chainSlug} />}
      </div>
      <p className="mt-3 text-center text-sm leading-6 text-[var(--color-muted)]">{m.blurb}</p>
      {link ? <FeaturedOddsBar address={link.address} chainSlug={link.chainSlug} /> : <NeutralOddsBar />}
      <div className="mt-3 text-center text-sm font-semibold text-[#007AFF]">
        {link ? 'Trade YES / NO →' : `Opens soon · closes ${closesLabel(m.closesUtc)}`}
      </div>
    </>
  )

  // No `overflow-hidden` here: it would clip the resolution-rules tooltip that
  // pops out below/around the "?" icon. The gradient still respects the rounded
  // corners on its own (backgrounds are clipped to the border radius).
  const cls =
    'rounded-[32px] border border-[rgba(0,82,255,0.25)] bg-gradient-to-br from-[rgba(0,82,255,0.06)] to-white p-7'

  if (!link) {
    return <div className={`${cls} opacity-80`}>{inner}</div>
  }
  return (
    <Link
      to={`/fifa/${link.address}?chain=${link.chainSlug}`}
      className={`${cls} block transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(20,20,20,0.1)]`}
    >
      {inner}
    </Link>
  )
}

export function CryptoMarketsPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-bg-0)] text-[var(--color-ink)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,82,255,0.08),transparent_24%),radial-gradient(circle_at_85%_20%,rgba(0,82,255,0.06),transparent_18%)]" />
      <SiteNav />
      <div className="relative mx-auto max-w-6xl px-6 pb-16 md:px-10">
        <section className="mt-6">
          <div className="inline-flex rounded-xl border border-[rgba(0,122,255,0.35)] bg-[rgba(0,122,255,0.06)] px-5 py-2 text-xs uppercase tracking-[0.2em] text-[#007AFF]">
            Crypto · US Policy 2026
          </div>
          <h1 className="mt-6 max-w-[760px] text-4xl font-semibold leading-[1.12] tracking-[-0.02em] md:text-5xl md:leading-[1.06]">
            Does crypto get its market-structure law?
          </h1>
          <p className="mt-5 max-w-[720px] text-base leading-7 text-[var(--color-muted)] md:text-lg">
            The CLARITY Act is the bill that would split oversight of digital assets between the SEC
            and the CFTC. Take a side on whether it actually becomes law before 2027 — resolved from
            the official public-law record at congress.gov.
          </p>
        </section>

        <section className="mt-10">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
              Digital-asset legislation
            </h2>
            <div className="h-px flex-1 bg-[rgba(20,20,20,0.1)]" />
          </div>
          <div className="mt-6 grid gap-6">
            {CRYPTO_MARKETS.map((m) => (
              <div key={m.id} className="grid items-start gap-5 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
                <CryptoCard m={m} />
                <ChampionHistoryChart
                  endpoint="/api/crypto/pool-history"
                  title="Clarity Act — live odds"
                  teamIds={[m.id]}
                  chartClassName="h-[150px] md:h-[170px]"
                  defaultRange="1m"
                  compact
                />
              </div>
            ))}
          </div>
        </section>

        <p className="mt-12 text-center text-xs text-[var(--color-muted)]">
          Enactment means signed by the President, becoming law without a signature, or passage over a
          veto. Passage by only one chamber, or enactment after Dec 31 2026, resolves NO.
        </p>
      </div>
    </div>
  )
}
