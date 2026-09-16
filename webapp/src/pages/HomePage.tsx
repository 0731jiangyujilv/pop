import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'

export function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-bg-0)] text-[var(--color-ink)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,82,255,0.08),transparent_24%),radial-gradient(circle_at_85%_20%,rgba(0,82,255,0.06),transparent_18%)]" />
      <div className="relative mx-auto max-w-6xl px-6 py-6 md:px-10">
        <header className="mb-8">
          <Logo />
        </header>
      <main className="grid w-full gap-6 lg:grid-cols-[1fr_0.92fr] lg:items-start">
        <section>
          <div className="inline-flex rounded-xl border border-[rgba(0,122,255,0.35)] bg-[rgba(0,122,255,0.06)] px-4 py-1.5 text-[11px] tracking-[0.2em] text-[#007AFF] uppercase">
            X-native prediction markets
          </div>
          <h1 className="mt-6 max-w-[640px] text-3xl leading-[1.12] font-semibold tracking-[-0.02em] md:text-5xl md:leading-[1.06]">
            Markets for<br />
            Internet Culture.
          </h1>
          <p className="mt-6 max-w-[680px] text-base leading-7 text-[var(--color-muted)] md:text-lg">
            Anyone on X can call their shot and turn it into a live onchain market in seconds.
            No code. No exchange. Just your take — and everyone else&apos;s money on the line.
          </p>

          <div className="mt-6 h-px w-full bg-[rgba(20,20,20,0.12)]" />

          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {[
              ['1,247', 'MARKETS CREATED'],
              ['$84,300', 'TOTAL POOLED'],
              ['6,891', 'BETS PLACED'],
            ].map(([value, label]) => (
              <div key={label}>
                <p className="text-2xl font-semibold tracking-[-0.01em] md:text-3xl">{value}</p>
                <p className="mt-1.5 text-xs leading-[1.4] tracking-[0.18em] text-[var(--color-muted)]">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="rounded-[28px] border border-[rgba(20,20,20,0.12)] bg-[#efefe9] p-5 md:p-7">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 overflow-hidden rounded-full bg-[rgba(0,82,255,0.2)]">
                <img
                  src="https://unavatar.io/twitter/_1_jade_?fallback=https%3A%2F%2Funavatar.io%2Fx%2F_1_jade_"
                  alt="J1 avatar"
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <p className="text-lg leading-none font-semibold tracking-[-0.01em]">J1</p>
                <p className="mt-1.5 text-sm leading-none text-[var(--color-muted)]">@_1_jade_</p>
              </div>
            </div>

            <p className="mt-5 text-lg leading-[1.3] tracking-[-0.01em] md:text-xl">
              <a href="https://x.com/populab_xyz" target="_blank" rel="noopener noreferrer" className="!text-[var(--color-cyan)] hover:underline">@populab_xyz</a> BTC hits $100k before August 1st?
            </p>

            <div className="mt-6 rounded-[24px] border border-[rgba(20,20,20,0.12)] bg-white p-5">
              <div className="flex items-center justify-between text-xs text-[var(--color-muted)] md:text-sm">
                <p>234 bets</p>
                <p>Closes July 31</p>
              </div>
              <p className="mt-3 text-2xl leading-none font-semibold tracking-[-0.02em] md:text-3xl">$12,400 <span className="text-lg font-normal text-[var(--color-muted)] md:text-xl">in pool</span></p>

              <div className="mt-6 h-3 rounded-full bg-[#d5d5d5]">
                <div className="h-full w-[62%] rounded-full bg-[var(--color-cyan)]" />
              </div>

              <div className="mt-4 flex items-center justify-between text-lg leading-none text-[var(--color-muted)] md:text-xl">
                <p>
                  <span className="text-[var(--color-ink)]">62%</span> Yes
                </p>
                <p>
                  <span className="text-[var(--color-ink)]">38%</span> No
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <a
              href="https://x.com/populab_xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-[24px] border border-[rgba(20,20,20,0.22)] bg-white px-6 py-4 text-center text-sm leading-none tracking-[-0.01em] transition hover:bg-[rgba(255,255,255,0.65)]"
            >
              Create your first bet
            </a>
            <Link
              to="/explore"
              className="block w-full rounded-[24px] border border-[rgba(20,20,20,0.22)] bg-white px-6 py-4 text-center text-sm leading-none tracking-[-0.01em] transition hover:bg-[rgba(255,255,255,0.65)]"
            >
              Explore live markets
            </Link>
          </div>
        </section>
      </main>
      </div>
    </div>
  )
}
