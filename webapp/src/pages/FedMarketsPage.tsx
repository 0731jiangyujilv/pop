import { Link, useLocation } from 'react-router-dom'
import { useReadContract } from 'wagmi'
import { SiteNav } from '@/components/SiteNav'
import { InfoTooltip } from '@/components/InfoTooltip'
import { ChampionHistoryChart } from '@/components/ChampionHistoryChart'
import { EVENT_MARKET_ABI } from '@/config/contracts'
import { getChainIdBySlug } from '@/config/chains'
import { formatProbability } from '@/lib/utils'
import { FED_MARKETS, fedLink, type FedMarket } from '@/data/fedRates'

// Dedicated "Will Fed cut rates?" page — one YES/NO market per 2026 FOMC
// meeting. Styled after ExploreMarketPage. A card has three states, driven
// entirely by fedRates.ts:
//   • RESOLVED — the meeting has happened and the market settled (`result` set);
//     the card stays clickable so winners can claim.
//   • LIVE NOW — an address is filled in for the meeting.
//   • SOON     — not deployed yet (addresses still blank).

// Live YES/NO split bar — reads the market's on-chain yesProbability.
function FeaturedOddsBar({ address, chainSlug }: { address: `0x${string}`; chainSlug: string }) {
  const chainId = getChainIdBySlug(chainSlug) ?? 0
  const { data: yesProb } = useReadContract({
    address,
    abi: EVENT_MARKET_ABI,
    functionName: 'yesProbability',
    chainId,
  })
  // Matches the Explore page: render the live on-chain split, defaulting to an
  // even 50/50 only while the first read is in flight, so a deployed market's
  // bar always shows a number instead of a "—" placeholder.
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

// Final split for a settled market: the winning side takes the whole bar.
function SettledOddsBar({ yesWins }: { yesWins: boolean }) {
  const winner = yesWins ? 'text-[#15803d]' : 'text-[rgb(233,21,45)]'
  const loser = 'text-[var(--color-muted)] line-through decoration-[1.5px]'
  return (
    <div className="mt-5 flex items-center gap-3">
      <span className={`whitespace-nowrap text-sm font-bold ${yesWins ? winner : loser}`}>YES {yesWins ? 100 : 0}%</span>
      <div className="h-[9px] w-full overflow-hidden rounded-full bg-[rgba(20,20,20,0.08)]">
        <div className={`h-full w-full rounded-full ${yesWins ? 'bg-[#15803d]' : 'bg-[rgb(233,21,45)]'}`} />
      </div>
      <span className={`whitespace-nowrap text-sm font-bold ${yesWins ? loser : winner}`}>NO {yesWins ? 0 : 100}%</span>
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
  return <InfoTooltip text={(source as string | undefined) ?? ''} label="Resolution source" className="ml-[4px]" />
}

function decisionLabel(unix: number): string {
  // Stable, locale-independent UTC label so the schedule reads the same anywhere.
  const d = new Date(unix * 1000)
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
  return `${date} · ${time} UTC`
}

// Shared card frame. Settled cards drop the blue accent so the live market stays
// the loudest thing on the page.
const CARD_CLS = 'rounded-[32px] border p-7'
const LIVE_CARD_CLS = `${CARD_CLS} border-[rgba(0,82,255,0.25)] bg-gradient-to-br from-[rgba(0,82,255,0.06)] to-white`
const SETTLED_CARD_CLS = `${CARD_CLS} border-[rgba(20,20,20,0.1)] bg-gradient-to-br from-[rgba(20,20,20,0.035)] to-white`

// Resolved card — the FOMC has decided and the market has settled on-chain. The
// market page stays reachable so holders of the winning side can claim.
function SettledFedCard({ m }: { m: FedMarket }) {
  const r = m.result!
  const link = fedLink(m)
  const verdict = r.yesWins ? 'YES' : 'NO'

  const inner = (
    <>
      <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
        <span className="rounded-full bg-[rgba(20,20,20,0.06)] px-2.5 py-1 text-[var(--color-ink)]">RESOLVED</span>
        <span>FOMC · {m.meetingLabel}</span>
      </div>
      <div className="mt-6 text-center text-lg font-semibold tracking-[-0.01em] text-[var(--color-ink)] md:text-xl">
        {m.question}
        {link && <ResolutionSourceTip address={link.address} chainSlug={link.chainSlug} />}
      </div>
      <div className="mt-4 flex justify-center">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] ${
            r.yesWins
              ? 'bg-[rgba(34,197,94,0.14)] text-[#15803d]'
              : 'bg-[rgba(233,21,45,0.12)] text-[rgb(233,21,45)]'
          }`}
        >
          {verdict} · {r.note}
        </span>
      </div>
      <SettledOddsBar yesWins={r.yesWins} />
      <div className="mt-3 text-center text-sm font-semibold text-[var(--color-muted)]">
        {link ? `Settled ${verdict} — view result / claim -->` : `Settled ${verdict}`}
      </div>
    </>
  )

  if (!link) return <div className={SETTLED_CARD_CLS}>{inner}</div>
  return (
    <Link
      to={`/fifa/${link.address}?chain=${link.chainSlug}`}
      className={`${SETTLED_CARD_CLS} block transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(20,20,20,0.08)]`}
    >
      {inner}
    </Link>
  )
}

function FedCard({ m }: { m: FedMarket }) {
  const link = fedLink(m)

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
        <span>FOMC · {m.meetingLabel}</span>
      </div>
      <div className="mt-6 text-center text-lg font-semibold tracking-[-0.01em] md:text-xl">
        {m.question}
        {link && <ResolutionSourceTip address={link.address} chainSlug={link.chainSlug} />}
      </div>
      {link ? <FeaturedOddsBar address={link.address} chainSlug={link.chainSlug} /> : <NeutralOddsBar />}
      <div className="mt-3 text-center text-sm font-semibold text-[#007AFF]">
        {link ? 'Trade YES / NO -->' : `Opens ${decisionLabel(m.decisionUtc)}`}
      </div>
    </>
  )

  // No `overflow-hidden` on the card: it would clip the resolution-source tooltip
  // that pops out below/around the "?" icon. The gradient still respects the
  // rounded corners on its own (backgrounds are clipped to the border radius).
  if (!link) {
    return <div className={`${LIVE_CARD_CLS} opacity-80`}>{inner}</div>
  }
  return (
    <Link
      to={`/fifa/${link.address}?chain=${link.chainSlug}`}
      className={`${LIVE_CARD_CLS} block transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(20,20,20,0.1)]`}
    >
      {inner}
    </Link>
  )
}

// Cross-link to the OddsShift hook demo. Deliberately off-palette — it borrows
// the OddsShift accent (#FF335F) instead of the page blue, so it reads as a door
// into a different product rather than as another Fed market.
function OddsShiftHookLink() {
  return (
    <Link
      to="/hook"
      className="block rounded-[10px] border-[1.5px] border-[rgba(255,51,95,0.35)] bg-[rgba(255,51,95,0.03)] px-5 py-4 text-center text-[15px] font-semibold text-[#FF335F] transition hover:border-[rgba(255,51,95,0.6)] hover:bg-[rgba(255,51,95,0.07)]"
    >
      Try OddsShift Hook --&gt;
    </Link>
  )
}

export function FedMarketsPage() {
  // This page is mounted at both `/` and `/fed`. Only the dedicated /fed page
  // carries the OddsShift Hook link under the headline card; either way the
  // chart card is sized to the left column so the two end on the same line.
  const showOddsShiftLink = useLocation().pathname.replace(/\/+$/, '') === '/fed'
  // Meetings still to come, in calendar order: the first one is the headline card
  // (LIVE once deployed, SOON before that); the rest are previews.
  const upcoming = FED_MARKETS.filter((m) => !m.result)
  const settled = FED_MARKETS.filter((m) => m.result)
  const featured = upcoming[0]
  const later = upcoming.slice(1)

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-bg-0)] text-[var(--color-ink)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,82,255,0.08),transparent_24%),radial-gradient(circle_at_85%_20%,rgba(0,82,255,0.06),transparent_18%)]" />
      <SiteNav />
      <div className="relative mx-auto max-w-6xl px-6 pb-16 md:px-10">
        <section className="mt-6">
          <div className="inline-flex rounded-xl border border-[rgba(0,122,255,0.35)] bg-[rgba(0,122,255,0.06)] px-5 py-2 text-xs uppercase tracking-[0.2em] text-[#007AFF]">
            US Macro · FOMC 2026
          </div>
          <h1 className="mt-6 max-w-[760px] text-4xl font-semibold leading-[1.12] tracking-[-0.02em] md:text-5xl md:leading-[1.06]">
            Will Fed cut rates?
          </h1>
          <p className="mt-5 max-w-[720px] text-base leading-7 text-[var(--color-muted)] md:text-lg">
            One market per 2026 FOMC meeting. YES = the Fed lowers the target federal funds rate by
            any amount at that meeting; NO = it holds or hikes. Each resolves from the official FOMC
            statement released after its own meeting. July is settled — the Fed held, so it paid out
            NO. September is next.
          </p>
        </section>

        {featured && (
          <section className="mt-10">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
                Next FOMC decision
              </h2>
              <div className="h-px flex-1 bg-[rgba(20,20,20,0.1)]" />
            </div>
            <div className="mt-6 grid items-stretch gap-5 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
              {showOddsShiftLink ? (
                // 1fr/auto: any extra row height goes to the card, never to the button.
                <div className="grid min-w-0 grid-rows-[1fr_auto] gap-5">
                  <FedCard m={featured} />
                  <OddsShiftHookLink />
                </div>
              ) : (
                <FedCard m={featured} />
              )}
              {/* The endpoint serves only the meeting(s) still trading; teamIds
                  pins the chart to the featured one regardless. The chart card
                  takes the row height (the left column's) and the plot fills
                  whatever is left below the title/legend, rather than a fixed
                  plot height dictating a taller card. */}
              <ChampionHistoryChart
                endpoint="/api/fed/pool-history"
                title={`${featured.month} rate cut — live odds`}
                teamIds={[featured.id]}
                className="flex flex-col"
                chartClassName="min-h-[120px] flex-1"
                defaultRange="1m"
                compact
              />
            </div>
          </section>
        )}

        {later.length > 0 && (
          <section className="mt-10">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
                Later in 2026
              </h2>
              <div className="h-px flex-1 bg-[rgba(20,20,20,0.1)]" />
            </div>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              {later.map((m) => (
                <FedCard key={m.id} m={m} />
              ))}
            </div>
          </section>
        )}

        {settled.length > 0 && (
          <section className="mt-10">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">Resolved</h2>
              <div className="h-px flex-1 bg-[rgba(20,20,20,0.1)]" />
            </div>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              {settled.map((m) => (
                <SettledFedCard key={m.id} m={m} />
              ))}
            </div>
          </section>
        )}

        <p className="mt-12 text-center text-xs text-[var(--color-muted)]">
          Each market resolves only on its own FOMC meeting, based on the official statement released
          afterwards. YES = any rate cut; NO = unchanged or hiked.
        </p>
      </div>
    </div>
  )
}
