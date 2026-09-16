import { Link } from 'react-router-dom'
import { useReadContract } from 'wagmi'
import { SiteNav } from '@/components/SiteNav'
import { InfoTooltip } from '@/components/InfoTooltip'
import { ChampionHistoryChart } from '@/components/ChampionHistoryChart'
import { EVENT_MARKET_ABI } from '@/config/contracts'
import { getChainIdBySlug } from '@/config/chains'
import { formatProbability } from '@/lib/utils'
import {
  CHAMPION_MARKETS,
  FINALS,
  championLink,
  finalLink,
  type ChampionMarket,
  type KnockoutTie,
  type KoTeam,
} from '@/data/worldCupKnockout'

// Live YES/NO split bar — reads the market's on-chain yesProbability.
function FeaturedOddsBar({ address, chainSlug }: { address: `0x${string}`; chainSlug: string }) {
  const chainId = getChainIdBySlug(chainSlug) ?? 0
  const { data: yesProb } = useReadContract({
    address,
    abi: EVENT_MARKET_ABI,
    functionName: 'yesProbability',
    chainId,
  })
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

// Reads the market's on-chain resolutionSource and exposes it as a hover tooltip
// next to the question. Renders nothing until the source is available.
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

function kickoffLabel(unix: number): string {
  // Stable, locale-independent UTC label so the schedule reads the same anywhere.
  const d = new Date(unix * 1000)
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
  return `${date} · ${time} UTC`
}

// ── Championship (tournament winner) markets ─────────────────────────────────
// One card per semi-finalist. Links to its live AMM once an address is filled
// in worldCupKnockout.ts; renders as a SOON preview while the slot is blank.
function ChampionCard({ m }: { m: ChampionMarket }) {
  const link = championLink(m)
  const champion = m.champion === true
  const eliminated = m.eliminated === true

  const accent = champion ? 'text-[#b45309]' : eliminated ? 'text-[var(--color-muted)]' : 'text-[#007AFF]'

  const badge = champion ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(245,158,11,0.16)] px-2.5 py-1 text-[#b45309]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" /> CHAMPION
    </span>
  ) : eliminated ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(233,21,45,0.1)] px-2.5 py-1 text-[rgb(233,21,45)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[rgb(233,21,45)]" /> SETTLED
    </span>
  ) : link ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(0,122,255,0.12)] px-2.5 py-1 text-[#0052CC]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#0052CC]" /> LIVE NOW
    </span>
  ) : (
    <span className="rounded-full bg-[rgba(20,20,20,0.05)] px-2.5 py-1 text-[var(--color-muted)]">SOON</span>
  )

  const inner = (
    <>
      <div className={`flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] ${accent}`}>
        {badge}
        <span>Champion</span>
      </div>
      <div className="mt-6 text-center text-lg font-semibold tracking-[-0.01em] md:text-xl">
        <span className="mr-2 text-2xl leading-none">{m.flag}</span>
        {m.team} to win World Cup 2026?
        {link && <ResolutionSourceTip address={link.address} chainSlug={link.chainSlug} />}
      </div>
      {link ? <FeaturedOddsBar address={link.address} chainSlug={link.chainSlug} /> : <NeutralOddsBar />}
      <div className={`mt-3 text-center text-sm font-semibold ${accent}`}>
        {champion
          ? '🏆 World Cup 2026 winner · view market →'
          : eliminated
            ? 'Knocked out · view market →'
            : link
              ? `Back ${m.team} →`
              : 'Market opens soon'}
      </div>
    </>
  )

  const cls = champion
    ? 'overflow-hidden rounded-[32px] border border-[rgba(245,158,11,0.45)] bg-gradient-to-br from-[rgba(245,158,11,0.12)] to-white p-7'
    : eliminated
      ? 'overflow-hidden rounded-[32px] border border-[rgba(20,20,20,0.12)] bg-gradient-to-br from-[rgba(20,20,20,0.04)] to-white p-7'
      : 'overflow-hidden rounded-[32px] border border-[rgba(0,82,255,0.25)] bg-gradient-to-br from-[rgba(0,82,255,0.06)] to-white p-7'

  if (!link) {
    return <div className={`${cls} opacity-80`}>{inner}</div>
  }
  return (
    <Link
      to={`/fifa/${link.address}?chain=${link.chainSlug}`}
      className={`${cls} block transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(20,20,20,0.1)] ${eliminated ? 'opacity-70 grayscale-[0.35] hover:opacity-100' : ''}`}
    >
      {inner}
    </Link>
  )
}

// ── Knockout ties (final / third-place play-off) ─────────────────────────────
// YES = the home team wins the tie. Live + clickable once an address is filled
// in worldCupKnockout.ts; a SOON preview until then.
function KnockoutTeamRow({ team, pct }: { team: KoTeam; pct: number | null }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <span className="text-2xl leading-none">{team.flag}</span>
        <span className="text-base font-semibold tracking-[-0.01em]">{team.name}</span>
      </div>
      <span className="text-sm font-semibold text-[var(--color-muted)]">{pct === null ? '—' : `${pct}%`}</span>
    </div>
  )
}

const KNOCKOUT_CARD_CLS = 'rounded-[26px] border border-[rgba(20,20,20,0.12)] bg-white p-5'

// Live card — reads the market's on-chain yesProbability (YES = home team wins).
function LiveKnockoutCard({
  m,
  link,
}: {
  m: KnockoutTie
  link: { address: `0x${string}`; chainSlug: string }
}) {
  const chainId = getChainIdBySlug(link.chainSlug) ?? 0
  const { data: yesProb } = useReadContract({
    address: link.address,
    abi: EVENT_MARKET_ABI,
    functionName: 'yesProbability',
    chainId,
  })
  const homePct = yesProb !== undefined ? Number(formatProbability(yesProb as bigint)) : 50
  const awayPct = Math.round((100 - homePct) * 100) / 100
  return (
    <Link
      to={`/fifa/${link.address}?chain=${link.chainSlug}`}
      className={`${KNOCKOUT_CARD_CLS} group block transition hover:-translate-y-0.5 hover:border-[rgba(0,82,255,0.35)] hover:shadow-[0_18px_44px_rgba(20,20,20,0.1)]`}
    >
      <div className="flex items-center justify-between text-xs font-medium text-[var(--color-muted)]">
        <span>{kickoffLabel(m.kickoffUtc)}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(34,197,94,0.12)] px-2.5 py-1 font-semibold text-[#15803d]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#15803d]" /> LIVE
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <KnockoutTeamRow team={m.home} pct={homePct} />
        <KnockoutTeamRow team={m.away} pct={awayPct} />
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[rgba(20,20,20,0.06)]">
        <div className="h-full rounded-full bg-[rgba(255,204,0,1)]" style={{ width: `${Math.min(100, Math.max(0, homePct))}%` }} />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="truncate pr-3 text-xs text-[var(--color-muted)]">{m.venue}</p>
        <span className="shrink-0 text-sm font-semibold text-[#007AFF]">Trade →</span>
      </div>
    </Link>
  )
}

// One team's row on a settled card: flag, name, final score. Loser is dimmed.
function SettledTeamRow({ team, score, won }: { team: KoTeam; score: number; won: boolean }) {
  return (
    <div className={`flex items-center justify-between ${won ? '' : 'opacity-55'}`}>
      <div className="flex items-center gap-2.5">
        <span className="text-2xl leading-none">{team.flag}</span>
        <span className="text-base font-semibold tracking-[-0.01em]">{team.name}</span>
        {won && (
          <span className="rounded-full bg-[rgba(34,197,94,0.14)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#15803d]">
            Advanced
          </span>
        )}
      </div>
      <span className="text-lg font-bold tabular-nums">{score}</span>
    </div>
  )
}

// Settled card — the tie has been played. Shows the final score; the market page
// stays reachable so users can view the result / claim.
function SettledKnockoutCard({ m, link }: { m: KnockoutTie; link: { address: `0x${string}`; chainSlug: string } | null }) {
  const r = m.result!
  const homeWon = r.winner === 'home'
  const winner = homeWon ? m.home : m.away
  const inner = (
    <>
      <div className="flex items-center justify-between text-xs font-medium text-[var(--color-muted)]">
        <span>{kickoffLabel(m.kickoffUtc)}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(20,20,20,0.08)] px-2.5 py-1 font-semibold text-[var(--color-ink)]">
          SETTLED
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <SettledTeamRow team={m.home} score={r.homeScore} won={homeWon} />
        <SettledTeamRow team={m.away} score={r.awayScore} won={!homeWon} />
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[rgba(20,20,20,0.06)]">
        <div className="h-full rounded-full bg-[rgba(20,20,20,0.28)]" style={{ width: `${homeWon ? 100 : 0}%` }} />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="truncate pr-3 text-xs text-[var(--color-muted)]">{m.venue}</p>
        <span className="shrink-0 text-sm font-semibold text-[#007AFF]">
          {link ? `${winner.name} advance →` : `${winner.name} advance`}
        </span>
      </div>
    </>
  )

  if (!link) {
    return <div className={`${KNOCKOUT_CARD_CLS} opacity-90`}>{inner}</div>
  }
  return (
    <Link
      to={`/fifa/${link.address}?chain=${link.chainSlug}`}
      className={`${KNOCKOUT_CARD_CLS} block transition hover:-translate-y-0.5 hover:border-[rgba(0,82,255,0.35)] hover:shadow-[0_18px_44px_rgba(20,20,20,0.1)]`}
    >
      {inner}
    </Link>
  )
}

// Preview card — market not deployed yet.
function PreviewKnockoutCard({ m }: { m: KnockoutTie }) {
  return (
    <div className={`${KNOCKOUT_CARD_CLS} opacity-90`}>
      <div className="flex items-center justify-between text-xs font-medium text-[var(--color-muted)]">
        <span>{kickoffLabel(m.kickoffUtc)}</span>
        <span className="rounded-full bg-[rgba(20,20,20,0.05)] px-2.5 py-1 font-semibold text-[var(--color-muted)]">SOON</span>
      </div>

      <div className="mt-4 space-y-3">
        <KnockoutTeamRow team={m.home} pct={null} />
        <KnockoutTeamRow team={m.away} pct={null} />
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[rgba(20,20,20,0.06)]">
        <div className="h-full w-1/2 rounded-full bg-[rgba(255,204,0,1)]" />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="truncate pr-3 text-xs text-[var(--color-muted)]">{m.venue}</p>
        <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">{m.roundLabel ?? 'Match'}</span>
      </div>
    </div>
  )
}

function KnockoutCard({ m }: { m: KnockoutTie }) {
  const link = finalLink(m)
  if (m.result) return <SettledKnockoutCard m={m} link={link} />
  return link ? <LiveKnockoutCard m={m} link={link} /> : <PreviewKnockoutCard m={m} />
}

export function ExploreMarketPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-bg-0)] text-[var(--color-ink)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,82,255,0.08),transparent_24%),radial-gradient(circle_at_85%_20%,rgba(0,82,255,0.06),transparent_18%)]" />
      <SiteNav />
      <div className="relative mx-auto max-w-6xl px-6 pb-16 md:px-10">
        <section className="mt-6">
          <div className="inline-flex rounded-xl border border-[rgba(0,122,255,0.35)] bg-[rgba(0,122,255,0.06)] px-5 py-2 text-xs uppercase tracking-[0.2em] text-[#007AFF]">
            FIFA World Cup 26™
          </div>
          <h1 className="mt-6 max-w-[760px] text-4xl font-semibold leading-[1.12] tracking-[-0.02em] md:text-5xl md:leading-[1.06]">
            🇪🇸 Spain are World Cup 2026 champions.
          </h1>
          <p className="mt-5 max-w-[720px] text-base leading-7 text-[var(--color-muted)] md:text-lg">
            La Roja beat Argentina 1–0 in the final to lift the trophy. Every market has settled —
            open a card to see the result or claim your winnings.
          </p>
        </section>

        {/* Championship markets — one per semi-finalist */}
        <section className="mt-10">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">Tournament winner</h2>
            <div className="h-px flex-1 bg-[rgba(20,20,20,0.1)]" />
          </div>
          <div className="mt-6">
            <ChampionHistoryChart teamIds={['argentina-champion-2026', 'spain-champion-2026']} />
          </div>
          <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {CHAMPION_MARKETS.map((m) => (
              <ChampionCard key={m.id} m={m} />
            ))}
          </div>
        </section>

        {/* Final & third-place play-off */}
        <section className="mt-12">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">Final &amp; 3rd place</h2>
            <div className="h-px flex-1 bg-[rgba(20,20,20,0.1)]" />
          </div>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {FINALS.map((m) => (
              <KnockoutCard key={m.slug} m={m} />
            ))}
          </div>
        </section>

        <p className="mt-12 text-center text-xs text-[var(--color-muted)]">
          Champion markets settle from the official FIFA World Cup 2026 final result. YES = that team wins the tournament.
        </p>
      </div>
    </div>
  )
}
