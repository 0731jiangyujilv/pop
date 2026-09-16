import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ConnectWallet } from '@/components/ConnectWallet'
import { Logo } from '@/components/Logo'
import { BOT_API_URL } from '@/lib/api'
import { arcTxLink } from '@/lib/explorer'
import type { ConsensusOracleVote, EvidenceItem, LatestConsensus } from '@/types/swarm'

type FetchState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: LatestConsensus }

function fmtTxShort(tx: string | null | undefined): string {
  if (!tx) return '—'
  return tx.length > 12 ? `${tx.slice(0, 6)}…${tx.slice(-4)}` : tx
}

function TxLink({ tx, className }: { tx: string | null | undefined; className?: string }) {
  if (!tx) return <span className={className ?? 'text-[var(--color-muted)]'}>—</span>
  const href = arcTxLink(tx)
  const base = className ?? 'font-mono text-[11px] tabular-nums text-[var(--color-cyan)]'
  if (!href) return <span className={base} title={tx}>{fmtTxShort(tx)}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${base} transition hover:underline`}
      title={tx}
    >
      {fmtTxShort(tx)}
    </a>
  )
}

function ReputationPill({ delta }: { delta: number | undefined }) {
  if (delta === undefined) {
    return (
      <span className="rounded-full border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.6)] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
        rep —
      </span>
    )
  }
  const positive = delta > 0
  const negative = delta < 0
  const label = delta > 0 ? `+${delta}` : `${delta}`
  const cls = positive
    ? 'border-[rgba(34,197,94,0.4)] bg-[rgba(34,197,94,0.1)] text-[#15803d]'
    : negative
      ? 'border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] text-[#dc2626]'
      : 'border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.6)] text-[var(--color-muted)]'
  return (
    <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] ${cls}`}>
      ERC-8004 {label}
    </span>
  )
}

function VerdictBadge({ verdict }: { verdict: 'YES' | 'NO' }) {
  const cls = verdict === 'YES'
    ? 'bg-[rgba(34,197,94,0.12)] text-[#15803d] ring-1 ring-[rgba(34,197,94,0.4)]'
    : 'bg-[rgba(239,68,68,0.12)] text-[#dc2626] ring-1 ring-[rgba(239,68,68,0.4)]'
  return (
    <span className={`rounded-md px-3 py-1.5 text-xs font-bold tracking-[0.18em] ${cls}`}>
      {verdict}
    </span>
  )
}

function EvidenceRow({ item }: { item: EvidenceItem }) {
  const [expanded, setExpanded] = useState(false)
  const text = item.text ?? ''
  const isLong = text.length > 220
  const display = expanded || !isLong ? text : `${text.slice(0, 220)}…`

  return (
    <div className="rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.85)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.2em] text-[var(--color-muted)]">
        <span className="font-mono">
          {item.source}
          {item.author ? <span className="ml-2 normal-case tracking-normal text-[var(--color-ink)]">{item.author}</span> : null}
        </span>
        <span className="font-mono normal-case tracking-normal">{item.timestamp}</span>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--color-ink)]">
        {display}
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="ml-2 align-baseline text-xs font-semibold text-[var(--color-cyan)] hover:underline"
          >
            {expanded ? 'collapse' : 'expand'}
          </button>
        )}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-[var(--color-muted)]">
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-[var(--color-cyan)] hover:underline"
          >
            {item.url}
          </a>
        ) : (
          <span>—</span>
        )}
        <span className="flex items-center gap-1.5">
          <span>nanopay</span>
          <TxLink tx={item.txHash ?? null} />
        </span>
      </div>
    </div>
  )
}

function OracleSection({ vote }: { vote: ConsensusOracleVote }) {
  const evidence = vote.evidence ?? []
  return (
    <article className="glow-card rounded-[28px] p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl leading-none">{vote.emoji}</span>
          <div>
            <div className="text-sm font-semibold text-[var(--color-ink)]">{vote.name}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-muted)]">
              {vote.dataSource} · {vote.oracleId}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ReputationPill delta={vote.reputationDelta} />
          <span className="rounded-full border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.6)] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
            conf {vote.confidence.toFixed(2)}
          </span>
          <VerdictBadge verdict={vote.verdict} />
        </div>
      </header>

      {vote.error && (
        <div className="mt-4 rounded-2xl border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.05)] p-4 text-sm text-[#dc2626]">
          oracle error · {vote.error}
        </div>
      )}

      {vote.reasoning && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-muted)]">Reasoning</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--color-ink)]">{vote.reasoning}</p>
        </div>
      )}

      {vote.summary && (
        <div className="mt-4 rounded-2xl border border-[rgba(0,0,255,0.12)] bg-[rgba(0,0,255,0.04)] p-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-cyan)]">Gemini summary</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--color-ink)]">{vote.summary}</p>
        </div>
      )}

      <div className="mt-4 grid gap-2 font-mono text-[10px] text-[var(--color-muted)] md:grid-cols-2">
        <div className="flex items-center gap-2">
          <span>summary tx</span>
          <TxLink tx={vote.summaryTxHash} />
        </div>
        <div className="flex items-center gap-2 md:justify-end">
          <span>verdict tx</span>
          <TxLink tx={vote.verdictTxHash} />
        </div>
      </div>

      <div className="mt-5">
        <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-muted)]">
          Evidence ({evidence.length})
        </p>
        {evidence.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--color-muted)]">no evidence captured for this resolve.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {evidence.map((e, i) => (
              <EvidenceRow key={`${e.id}-${i}`} item={e} />
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

export function EventOraclesPage() {
  const { contractAddress } = useParams<{ contractAddress: string }>()
  const [searchParams] = useSearchParams()
  const chainId = searchParams.get('chainId') ?? ''
  const [state, setState] = useState<FetchState>({ kind: 'loading' })

  useEffect(() => {
    if (!contractAddress) {
      setState({ kind: 'error', message: 'missing contract address' })
      return
    }
    const url = new URL(`${BOT_API_URL}/api/swarm/consensus/by-contract/${contractAddress.toLowerCase()}`)
    if (chainId) url.searchParams.set('chainId', chainId)

    let cancelled = false
    fetch(url.toString())
      .then(async (r) => {
        if (cancelled) return
        if (r.status === 404) {
          setState({ kind: 'error', message: 'no swarm consensus is on file for this market yet.' })
          return
        }
        if (!r.ok) {
          const text = await r.text().catch(() => '')
          setState({ kind: 'error', message: `lookup failed (${r.status}): ${text.slice(0, 200)}` })
          return
        }
        const json = (await r.json()) as LatestConsensus
        setState({ kind: 'ready', data: json })
      })
      .catch((err) => {
        if (cancelled) return
        setState({ kind: 'error', message: err?.message ?? 'fetch failed' })
      })
    return () => {
      cancelled = true
    }
  }, [contractAddress, chainId])

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-bg-0)] text-[var(--color-ink)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,0,255,0.08),transparent_24%),radial-gradient(circle_at_85%_20%,rgba(0,0,255,0.06),transparent_18%)]" />
      <div className="relative mx-auto max-w-5xl px-6 py-8 md:px-10">
        <header className="flex items-center justify-between">
          <Logo />
          <ConnectWallet />
        </header>

        <div className="mt-10">
          <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-cyan)]">Powered by Constellar</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            How this market was resolved.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-muted)] md:text-base">
            Every agent that produced evidence for this prediction is shown below — with its raw findings, AI summary,
            verdict, and the reputation delta written to ERC-8004.
          </p>
          <div className="mt-4 flex items-center gap-3 text-xs text-[var(--color-muted)]">
            <Link
              to={`/event/${contractAddress}${chainId ? `?chainId=${chainId}` : ''}`}
              className="rounded-full border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] px-4 py-2 font-mono uppercase tracking-[0.18em] text-[var(--color-cyan)] hover:underline"
            >
              ← back to market
            </Link>
            {contractAddress && (
              <span className="font-mono">
                {contractAddress.slice(0, 8)}…{contractAddress.slice(-6)}
              </span>
            )}
          </div>
        </div>

        {state.kind === 'loading' && (
          <div className="mt-10 glow-card rounded-[28px] p-10 text-center text-sm text-[var(--color-muted)]">
            loading swarm consensus…
          </div>
        )}

        {state.kind === 'error' && (
          <div className="mt-10 glow-card rounded-[28px] p-10 text-center">
            <p className="text-sm text-[var(--color-muted)]">{state.message}</p>
          </div>
        )}

        {state.kind === 'ready' && <Body data={state.data} />}
      </div>
    </div>
  )
}

function Body({ data }: { data: LatestConsensus }) {
  const totalW = data.yesWeight + data.noWeight
  const yesPct = totalW > 0 ? (data.yesWeight / totalW) * 100 : 50
  const noPct = 100 - yesPct
  const finalCls = data.outcome === 'YES'
    ? 'bg-[rgba(34,197,94,0.14)] text-[#15803d]'
    : 'bg-[rgba(239,68,68,0.12)] text-[#dc2626]'

  return (
    <>
      <section className="mt-10 glow-card rounded-[28px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--color-muted)]">Question</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight md:text-2xl">{data.question}</h2>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-muted)]">
              topic · {data.topic}
            </p>
          </div>
          <span className={`rounded-md px-4 py-2 font-mono text-sm font-bold tracking-[0.2em] ${finalCls}`}>
            {data.outcome}
          </span>
        </div>

        <div className="mt-5 flex h-2 w-full overflow-hidden rounded-full bg-[rgba(20,20,20,0.08)]">
          <div className="bg-[#dc2626]/70 transition-all" style={{ width: `${noPct}%` }} />
          <div className="bg-[#15803d]/70 transition-all" style={{ width: `${yesPct}%` }} />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] tabular-nums text-[var(--color-muted)]">
          <span>NO {data.noWeight.toFixed(2)}</span>
          <span>YES {data.yesWeight.toFixed(2)}</span>
        </div>

        <dl className="mt-6 grid gap-4 text-sm md:grid-cols-4">
          <div>
            <dt className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-muted)]">Spread</dt>
            <dd className="mt-1 font-mono text-base">{data.spread.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-muted)]">Nanopayments</dt>
            <dd className="mt-1 font-mono text-base">86</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-muted)]">Spent</dt>
            <dd className="mt-1 font-mono text-base">${data.totalSpentUsdc.toFixed(4)}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-muted)]">Resolution tx</dt>
            <dd className="mt-1">
              <TxLink tx={data.resolutionTxHash} className="font-mono text-base text-[var(--color-cyan)]" />
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-8 space-y-6">
        {data.perOracle.map((vote) => (
          <OracleSection key={vote.oracleId} vote={vote} />
        ))}
      </section>

      <p className="mt-10 text-center font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--color-muted)]">
        constellar · 7 autonomous agents · gemini + x402 nanopayments on arc
      </p>
    </>
  )
}
