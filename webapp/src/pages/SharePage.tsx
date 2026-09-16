import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { shareOnXUrl } from '@/lib/utils'

export function SharePage() {
  const { contractAddress } = useParams<{ contractAddress: string }>()
  const [searchParams] = useSearchParams()
  const chainId = searchParams.get('chainId')
  const chainSuffix = chainId ? `?chainId=${chainId}` : ''
  const marketUrl = contractAddress && typeof window !== 'undefined'
    ? `${window.location.origin}/bet/${contractAddress}${chainSuffix}`
    : ''

  const shareText = 'Live prediction market is open. Pick a side and join the pool.'

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-bg-0)] text-[var(--color-ink)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,0,255,0.08),transparent_24%),radial-gradient(circle_at_80%_20%,rgba(0,0,255,0.06),transparent_18%)]" />
      <div className="relative mx-auto max-w-4xl px-6 py-8 md:px-10">
        <header className="flex items-center justify-between">
          <Logo />
          <Link
            to={contractAddress ? `/bet/${contractAddress}${chainSuffix}` : '/'}
            className="rounded-full border border-[rgba(20,20,20,0.12)] bg-white px-4 py-2 text-xs uppercase tracking-[0.24em] text-[var(--color-cyan)]"
          >
            Open Market
          </Link>
        </header>

        <div className="mt-12 grid gap-8 md:grid-cols-[1fr_0.9fr]">
          <section>
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-cyan)]">Share To X</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-6xl">Push the market back into the conversation.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted)] md:text-base">
              This page exists for the X bot workflow. After a contract is live, the creator can post the direct prediction link back to X and let the bot amplify it.
            </p>
          </section>

          <section className="glow-card rounded-[28px] p-6">
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">Share Link</p>
            <div className="mt-4 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4">
              <p className="break-all text-sm text-[var(--color-ink)]">{marketUrl || 'Missing contract address'}</p>
            </div>
            <div className="mt-5 grid gap-3">
              <a
                href={shareOnXUrl(shareText, marketUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-[var(--color-cyan)] px-5 py-4 text-center text-sm font-semibold text-white"
              >
                Post on X
              </a>
              {marketUrl && (
                <button
                  onClick={() => navigator.clipboard.writeText(marketUrl)}
                  className="rounded-full border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] px-5 py-4 text-sm font-semibold text-[var(--color-cyan)]"
                >
                  Copy Link
                </button>
              )}
            </div>
            <div className="mt-6 rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-cyan)]">Recommended copy</p>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                BTC prediction market is live on chain. Choose UP or DOWN, join the POP flow, and settle against an on-demand oracle snapshot.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
