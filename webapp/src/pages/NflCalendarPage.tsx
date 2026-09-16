import { ExternalLink } from 'lucide-react'
import { SiteNav } from '@/components/SiteNav'

// In-app landing for the "NFL 2026" nav item. The markets aren't live yet, so this
// shows a "Coming soon" state and links out to the official NFL schedule release
// rather than sending users straight off-site from the nav bar.
const NFL_SCHEDULE_URL = 'https://www.nfl.com/nfl-schedule-release/'

export function NflCalendarPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-bg-0)] text-[var(--color-ink)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,82,255,0.08),transparent_24%),radial-gradient(circle_at_85%_20%,rgba(0,82,255,0.06),transparent_18%)]" />
      <SiteNav />
      <div className="relative mx-auto max-w-6xl px-6 pb-16 md:px-10">
        <section className="mt-6">
          <div className="inline-flex rounded-xl border border-[rgba(0,122,255,0.35)] bg-[rgba(0,122,255,0.06)] px-5 py-2 text-xs uppercase tracking-[0.2em] text-[#007AFF]">
            NFL · 2026 Season
          </div>
          <h1 className="mt-6 max-w-[760px] text-4xl font-semibold leading-[1.12] tracking-[-0.02em] md:text-5xl md:leading-[1.06]">
            NFL 2026 Calendar
          </h1>
          <p className="mt-5 max-w-[720px] text-base leading-7 text-[var(--color-muted)] md:text-lg">
            Markets on the 2026 NFL season are on the way. In the meantime, check the official
            league schedule release for confirmed dates and matchups.
          </p>
        </section>

        <section className="mt-10">
          <div className="rounded-[32px] border border-[rgba(0,82,255,0.25)] bg-gradient-to-br from-[rgba(0,82,255,0.06)] to-white p-10 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(20,20,20,0.05)] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Coming soon
            </span>
            <h2 className="mt-6 text-2xl font-semibold tracking-[-0.01em] md:text-3xl">
              We're building the NFL 2026 markets
            </h2>
            <p className="mx-auto mt-4 max-w-[520px] text-base leading-7 text-[var(--color-muted)]">
              Take a side on the games that matter — odds, calendar, and live trading are landing here soon.
            </p>
            <a
              href={NFL_SCHEDULE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#0052FF] px-6 py-3 text-sm font-semibold text-white! transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(0,82,255,0.28)]"
            >
              View the official NFL schedule
              <ExternalLink aria-hidden className="h-4 w-4" strokeWidth={2.2} />
            </a>
          </div>
        </section>
      </div>
    </div>
  )
}
