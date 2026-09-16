import { Link } from 'react-router-dom'
import { SiteNav } from '@/components/SiteNav'
import { ChampionHistoryChart } from '@/components/ChampionHistoryChart'

// Dedicated page for the champion odds sampled from OUR OWN on-chain pools
// (EventMarket yesProbability()), as opposed to the Explore page which mirrors
// Polymarket. Same multi-line chart component, different data endpoint.
// Backed by GET /api/worldcup/champion-pool-history.
export function ChampionPoolHistoryPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-bg-0)] text-[var(--color-ink)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,82,255,0.08),transparent_24%),radial-gradient(circle_at_85%_20%,rgba(0,82,255,0.06),transparent_18%)]" />
      <SiteNav />
      <div className="relative mx-auto max-w-6xl px-6 pb-16 md:px-10">
        <section className="mt-6">
          <div className="inline-flex rounded-xl border border-[rgba(0,122,255,0.35)] bg-[rgba(0,122,255,0.06)] px-5 py-2 text-xs uppercase tracking-[0.2em] text-[#007AFF]">
            POP Pool Odds
          </div>
          <h1 className="mt-6 max-w-[760px] text-4xl font-semibold leading-[1.12] tracking-[-0.02em] md:text-5xl md:leading-[1.06]">
            Champion odds, straight from our pools
          </h1>
          <p className="mt-5 max-w-[720px] text-base leading-7 text-[var(--color-muted)] md:text-lg">
            The implied YES probability of each quarter-finalist winning the World Cup, sampled
            from our on-chain EventMarket pools every 30 minutes. This is our own market — compare
            it with the Polymarket-mirrored odds on{' '}
            <Link to="/explore" className="font-semibold text-[#007AFF] hover:underline">Explore</Link>.
          </p>
        </section>

        <section className="mt-10">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">Tournament winner — POP pools</h2>
            <div className="h-px flex-1 bg-[rgba(20,20,20,0.1)]" />
          </div>
          <div className="mt-6">
            <ChampionHistoryChart
              endpoint="/api/worldcup/champion-pool-history"
              title="World Cup Winner — POP pool odds"
              subtitle="Implied probability over time from our on-chain EventMarket pools."
              footer="Odds from POP pools"
            />
          </div>
        </section>
      </div>
    </div>
  )
}
