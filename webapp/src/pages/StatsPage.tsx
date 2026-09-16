import { useChainId, useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { BET_POR_ABI, BET_POR_ADDRESS } from '@/config/contracts'
import { getChainConfig } from '@/config/chains'

export function StatsPage() {
  const chainId = useChainId()
  const chainConfig = getChainConfig(chainId)
  const explorerUrl = chainConfig?.explorerUrl || 'https://sepolia.basescan.org'
  const { data: latestReport, isLoading, error } = useReadContract({
    address: BET_POR_ADDRESS,
    abi: BET_POR_ABI,
    functionName: 'getLatestReport',
  })

  const { data: reportCount } = useReadContract({
    address: BET_POR_ADDRESS,
    abi: BET_POR_ABI,
    functionName: 'reportCount',
  })

  if (isLoading) {
    return <ScreenState title="Syncing Proof-of-Reserve" body="Loading live platform statistics..." />
  }

  if (error || !latestReport) {
    return <ScreenState title="Stats unavailable" body={error?.message || 'Failed to load on-chain statistics.'} />
  }

  const cards = [
    ['Total Predictions', latestReport.totalBets.toString()],
    ['Active Predictions', latestReport.activeBets.toString()],
    ['Settled Predictions', latestReport.settledBets.toString()],
    ['Total Volume', `${parseFloat(formatUnits(latestReport.totalVolume, 18)).toFixed(2)} USDC`],
    ['Top Player Profit', `${parseFloat(formatUnits(latestReport.topPlayerProfit, 18)).toFixed(2)} USDC`],
    ['Last Update', new Date(Number(latestReport.timestamp)).toLocaleString()],
  ]

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-bg-0)] text-[var(--color-ink)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,0,255,0.08),transparent_25%),radial-gradient(circle_at_80%_20%,rgba(0,0,255,0.06),transparent_18%)]" />
      <div className="relative mx-auto max-w-6xl px-6 py-8 md:px-10">
        <header className="flex items-center justify-between">
          <Logo />
          <Link
            to="/"
            className="rounded-full border border-[rgba(20,20,20,0.12)] bg-white px-4 py-2 text-xs uppercase tracking-[0.24em] text-[var(--color-cyan)]"
          >
            Back Home
          </Link>
        </header>

        <div className="mt-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] px-4 py-2 text-xs uppercase tracking-[0.24em] text-[var(--color-cyan)]">
            Chainlink Proof of Reserve
          </div>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-6xl">Protocol telemetry, verified on-chain.</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-muted)] md:text-base">
            These metrics are pulled from the PoR contract and rendered in the same visual system as the X-native market UI.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map(([label, value]) => (
            <div key={label} className="glow-card rounded-[28px] p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">{label}</p>
              <p className="mt-4 text-3xl font-semibold text-[var(--color-ink)]">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="glow-card rounded-[28px] p-6">
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-cyan)]">Verification Status</p>
            <p className="mt-4 text-2xl font-semibold text-[var(--color-cyan)]">
              {latestReport.isValid ? 'Data Verified' : 'Data Mismatch'}
            </p>
            <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
              CRE and PoR keep the social layer auditable. If the off-chain view diverges from on-chain totals, the verification state flips immediately.
            </p>
          </div>
          <div className="glow-card rounded-[28px] p-6">
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-cyan)]">Contract Details</p>
            <p className="mt-4 break-all text-sm text-[var(--color-ink)]">{BET_POR_ADDRESS}</p>
            <p className="mt-4 text-sm text-[var(--color-muted)]">Report count: {reportCount?.toString() || '0'}</p>
            <a
              href={`${explorerUrl}/address/${BET_POR_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-block rounded-full border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] px-4 py-2 text-xs uppercase tracking-[0.24em] text-[var(--color-cyan)]"
            >
              View on Scan
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

function ScreenState({ title, body }: { title: string; body: string }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-bg-0)] text-[var(--color-ink)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,0,255,0.08),transparent_25%),radial-gradient(circle_at_80%_20%,rgba(0,0,255,0.06),transparent_18%)]" />
      <div className="relative mx-auto max-w-3xl px-6 py-24">
        <div className="glow-card rounded-[28px] p-10 text-center">
          <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">{title}</p>
          <p className="mt-5 text-lg text-[var(--color-ink)]">{body}</p>
        </div>
      </div>
    </div>
  )
}
