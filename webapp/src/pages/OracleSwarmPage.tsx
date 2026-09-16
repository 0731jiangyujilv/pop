import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSwarmSse } from '@/hooks/useSwarmSse'
import { OracleCard } from '@/components/swarm/OracleCard'
import { AggregateBar } from '@/components/swarm/AggregateBar'
import { EventTicker } from '@/components/swarm/EventTicker'
import { arcAddressLink, arcContractReadLink, arcTxLink, shortAddr } from '@/lib/explorer'
import type { LatestConsensus, OracleNode } from '@/types/swarm'

export function OracleSwarmPage() {
  const { nodes, events, pulseTick, aggregate, connected, latestConsensus } = useSwarmSse()
  const nodeOrder = nodes.map((n) => n.id)
  const registryAddress = nodes.find((n) => n.registryAddress)?.registryAddress
  const registryLink = arcAddressLink(registryAddress ?? null)
  const registeredCount = nodes.filter((n) => !!n.agentTokenId).length

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f8f9fb] text-[#0a0b0d]">
      {/* Ambient backdrop */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(circle at 15% 10%, rgba(0,0,255,0.05), transparent 40%),
            radial-gradient(circle at 85% 5%, rgba(60,138,255,0.04), transparent 45%),
            radial-gradient(circle at 50% 100%, rgba(0,0,255,0.03), transparent 50%)
          `,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(20,20,20,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(20,20,20,0.07) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative mx-auto max-w-[1440px] px-6 py-8 md:px-10">
        {/* Top nav */}
        <header className="mb-8 flex items-center justify-between">
          <h1 className="font-mono text-2xl font-bold tracking-[0.04em] text-[#0a0b0d]">Constellar</h1>
          <nav className="flex items-center gap-6 font-mono text-[11px] tracking-[0.18em] text-[#717886]">
            <Link to="/" className="transition hover:text-[#0a0b0d]">← HOME</Link>
            <Link to="/explore" className="transition hover:text-[#0a0b0d]">EXPLORE</Link>
            <Link to="/stats" className="transition hover:text-[#0a0b0d]">STATS</Link>
            <span className="rounded bg-[#0000ff]/10 px-2.5 py-1 text-[#0000ff]">SWARM</span>
          </nav>
        </header>

        {/* Tagline / system context */}
        <div className="mb-6 flex items-center gap-4">
          <div className="inline-flex items-center gap-2 rounded-md border border-[#0000ff]/30 bg-[#0000ff]/5 px-3 py-1.5 font-mono text-[10px] tracking-[0.2em] text-[#3c8aff] uppercase">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3c8aff]" />
            AI Agents Oracle Powered by Gemini &amp; x402 Nanopayments on Arc
          </div>
        </div>

        {/* Aggregate bar */}
        <AggregateBar aggregate={aggregate} pulseTick={pulseTick} nodeOrder={nodeOrder} />

        {/* ERC-8004 registry panel */}
        <RegistryPanel
          registryAddress={registryAddress ?? null}
          registryLink={registryLink}
          registeredCount={registeredCount}
          nodes={nodes}
        />


        {/* Main grid */}
        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_460px]">
          {/* Oracle cards */}
          <div className="grid gap-5 sm:grid-cols-2 2xl:grid-cols-3">
            {nodes.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-12 text-center font-mono text-[11px] tracking-[0.18em] text-slate-500">
                {connected ? (
                  <>
                    waiting for first heartbeat…
                    <div className="mt-3 text-[10px] text-slate-400">
                      start the swarm with <span className="text-[#10F3B5]">npm run swarm:start</span> in <span className="text-slate-700">/oracles</span>
                    </div>
                  </>
                ) : (
                  <>
                    sse stream offline
                    <div className="mt-3 text-[10px] text-slate-400">
                      is bot running? <span className="text-[#FFC44D]">npm run dev:service</span> in <span className="text-slate-700">/bot</span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              nodes.map((n) => (
                <OracleCard
                  key={n.id}
                  node={n}
                  pulse={pulseTick?.nodeId === n.id}
                  killed={n.status === 'offline'}
                  onToggleKill={() => {
                    // kill/restart lives in pm2 — shown as hint
                    console.info(`run: pm2 ${n.status === 'offline' ? 'restart' : 'stop'} ${n.id}`)
                  }}
                />
              ))
            )}
          </div>

          {/* Right column: event ticker */}
          <div className="space-y-6">
            <EventTicker events={events} />
            <ConsensusCard consensus={latestConsensus} />
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-10 flex items-center justify-between border-t border-[#dee1e7] pt-6 font-mono text-[10px] tracking-[0.16em] text-[#717886]">
          <div>
            <span>Powered by</span>{' '}
            <span className="font-semibold text-[#0a0b0d]">Gemini &amp; Circle Nanopayments</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3c8aff]" />
            <span>TELEMETRY ACTIVE</span>
          </div>
        </footer>
      </div>
    </div>
  )
}

type RegistryPanelProps = {
  registryAddress: string | null
  registryLink: string | null
  registeredCount: number
  nodes: OracleNode[]
}

function RegistryPanel({ registryAddress, registryLink, registeredCount, nodes }: RegistryPanelProps) {
  const allRegistered = registeredCount === nodes.length && nodes.length > 0
  const readLinkBase = arcContractReadLink(registryAddress)
  const walletExplorer = (addr: string) => arcAddressLink(addr)

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-[#c2c8d4] bg-white shadow-[0_2px_12px_-6px_rgba(0,0,0,0.12)]">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[#c2c8d4] bg-[#f2f4f7] px-5 py-3">
        <span className="rounded border border-[#0000ff]/30 bg-[#0000ff]/10 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.22em] text-[#0000ff]">
          ERC-8004
        </span>
        <div className="min-w-0">
          <div className="font-mono text-[13px] font-semibold tracking-[0.16em] text-[#0a0b0d]">
            ORACLE REGISTRATION
          </div>
          <div className="mt-0.5 font-mono text-[10px] tracking-[0.16em] text-[#b1b7c3]">
            identity · reputation · validation (trust layer)
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-4 font-mono text-[10px] tracking-[0.16em]">
          <div className="flex items-center gap-1.5 text-[#717886]">
            <span>chain</span>
            <span className="text-[#32353d]">Arc</span>
          </div>
          <div className="flex items-center gap-1.5 text-[#717886]">
            <span>agents</span>
            <span className={`text-[13px] tabular-nums ${allRegistered ? 'text-[#66c800]' : 'text-[#ffd12f]'}`}>
              {registeredCount}
            </span>
            <span className="text-[#b1b7c3]">/ {nodes.length || '-'} registered</span>
          </div>
          {registryAddress ? (
            registryLink ? (
              <a
                href={registryLink}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-1.5 rounded-md border border-[#0000ff]/25 bg-[#0000ff]/5 px-2.5 py-1 text-[#32353d] transition hover:border-[#0000ff]/50 hover:bg-[#0000ff]/10 hover:text-[#0000ff]"
                title={registryAddress}
              >
                <span className="tabular-nums">{shortAddr(registryAddress, 8, 6)}</span>
                <span className="text-[9px] text-[#717886] group-hover:text-[#0000ff]">↗ arcscan</span>
              </a>
            ) : (
              <span className="rounded-md bg-[#eef0f3] px-2.5 py-1 text-[#32353d] tabular-nums">
                {shortAddr(registryAddress, 8, 6)}
              </span>
            )
          ) : (
            <span className="rounded-md bg-[#fc401f]/10 px-2.5 py-1 text-[#fc401f]">not deployed</span>
          )}
        </div>
      </div>

      {/* Agent list */}
      <div className="divide-y divide-[#e8ecf2]">
        {nodes.length === 0 ? (
          <div className="px-5 py-6 text-center font-mono text-[11px] tracking-[0.16em] text-[#b1b7c3]">
            no agents reporting yet
          </div>
        ) : (
          nodes.map((n) => {
            const registered = !!n.agentTokenId
            const rep = typeof n.reputation === 'number' ? n.reputation : null
            const repColor =
              rep === null
                ? 'text-slate-400'
                : rep > 0
                  ? 'text-[#66c800]'
                  : rep < 0
                    ? 'text-[#fc401f]'
                    : 'text-[#32353d]'
            const walletLink = walletExplorer(n.walletAddress)
            const readLink = registered && readLinkBase
              ? `${readLinkBase}` // Same read tab; args entered by user
              : null

            return (
              <div
                key={n.id}
                className="grid grid-cols-[38px_140px_96px_1fr_80px_110px] items-center gap-4 px-5 py-3 font-mono text-[11px]"
              >
                <span className="text-2xl leading-none" style={{ filter: n.status === 'offline' ? 'grayscale(1) opacity(0.5)' : 'none' }}>
                  {n.emoji}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-semibold tracking-[0.08em] text-slate-900">
                    {n.name}
                  </div>
                  <div className="truncate text-[9px] tracking-[0.16em] text-slate-400 uppercase">
                    {n.dataSource}
                  </div>
                </div>

                {/* Agent token ID */}
                <div>
                  {registered ? (
                    readLink ? (
                      <a
                        href={readLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`read agents(${n.agentTokenId}) on Arc`}
                        className="inline-flex items-center gap-1 rounded-sm border border-[#0000ff]/25 bg-[#0000ff]/5 px-2 py-0.5 text-[#0000ff] transition hover:border-[#0000ff]/50 hover:bg-[#0000ff]/10"
                      >
                        <span className="text-[9px] tracking-[0.14em] text-[#717886]">ID</span>
                        <span className="tabular-nums">#{n.agentTokenId}</span>
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-sm border border-[#c2c8d4] bg-[#f2f4f7] px-2 py-0.5">
                        <span className="text-[9px] tracking-[0.14em] text-[#717886]">ID</span>
                        <span className="tabular-nums text-[#32353d]">#{n.agentTokenId}</span>
                      </span>
                    )
                  ) : (
                    <span className="inline-flex items-center rounded-sm border border-[#ffd12f]/40 bg-[#ffd12f]/15 px-2 py-0.5 text-[9px] tracking-[0.16em] text-[#5b616e]">
                      UNREGISTERED
                    </span>
                  )}
                </div>

                {/* Wallet / agent address */}
                <div className="min-w-0 truncate">
                  {walletLink ? (
                    <a
                      href={walletLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group inline-flex items-center gap-1.5 text-[#32353d] transition hover:text-[#0000ff]"
                      title={n.walletAddress}
                    >
                      <span className="text-[9px] tracking-[0.14em] text-[#b1b7c3] group-hover:text-[#0000ff]">
                        AGENT
                      </span>
                      <span className="tabular-nums">{shortAddr(n.walletAddress, 6, 4)}</span>
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[#32353d]" title={n.walletAddress}>
                      <span className="text-[9px] tracking-[0.14em] text-[#b1b7c3]">AGENT</span>
                      <span className="tabular-nums">{shortAddr(n.walletAddress, 6, 4)}</span>
                    </span>
                  )}
                </div>

                {/* Reputation */}
                <div className="text-right">
                  {rep === null ? (
                    <span className="text-[#b1b7c3]">—</span>
                  ) : readLink ? (
                    <a
                      href={readLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`read reputation(${n.agentTokenId}) on Arc`}
                      className="inline-flex items-center gap-1.5 text-[#717886] transition hover:text-[#32353d]"
                    >
                      <span className="text-[9px] tracking-[0.14em]">REP</span>
                      <span className={`text-[12px] tabular-nums ${repColor}`}>
                        {rep > 0 ? '+' : ''}{rep}
                      </span>
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[#717886]">
                      <span className="text-[9px] tracking-[0.14em]">REP</span>
                      <span className={`text-[12px] tabular-nums ${repColor}`}>
                        {rep > 0 ? '+' : ''}{rep}
                      </span>
                    </span>
                  )}
                </div>

                {/* Status pill */}
                <div className="flex items-center justify-end gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      n.status === 'offline'
                        ? 'bg-[#fc401f]'
                        : n.status === 'degraded'
                          ? 'bg-[#ffd12f]'
                          : 'bg-[#3c8aff] animate-pulse'
                    }`}
                  />
                  <span
                    className={`text-[9px] tracking-[0.2em] ${
                      n.status === 'offline'
                        ? 'text-[#fc401f]'
                        : n.status === 'degraded'
                          ? 'text-[#ffd12f]'
                          : 'text-[#3c8aff]'
                    }`}
                  >
                    {n.status === 'healthy' ? 'LIVE' : n.status === 'degraded' ? 'SLOW' : 'OFFLINE'}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

function fmtTxShort(tx: string): string {
  if (!tx) return '—'
  return tx.length > 12 ? `${tx.slice(0, 6)}…${tx.slice(-4)}` : tx
}

function TxLink({ tx, className }: { tx: string | null | undefined; className?: string }) {
  if (!tx) return <span className={className ?? ''}>—</span>
  const href = arcTxLink(tx)
  const base = className ?? 'font-mono text-[11px] tabular-nums text-[#717886]'
  if (!href) return <span className={base} title={tx}>{fmtTxShort(tx)}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${base} transition hover:text-[#0000ff] hover:underline`}
      title={tx}
    >
      {fmtTxShort(tx)}
    </a>
  )
}

function ConsensusCard({ consensus }: { consensus: LatestConsensus | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(id)
  }, [])

  if (!consensus) {
    return (
      <div className="rounded-2xl border border-[#c2c8d4] bg-white p-5">
        <div className="font-mono text-[10px] tracking-[0.22em] text-[#b1b7c3]">LATEST CONSENSUS</div>
        <div className="mt-6 text-center font-mono text-[11px] leading-[1.7] text-[#717886]">
          waiting for first swarm resolution…
          <div className="mt-2 text-[10px] text-[#b1b7c3]">
            triggered on the next <span className="text-[#32353d]">EventBet.resolve()</span>
          </div>
        </div>
      </div>
    )
  }

  const totalW = consensus.yesWeight + consensus.noWeight
  const noPct = totalW > 0 ? (consensus.noWeight / totalW) * 100 : 50
  const final = consensus.outcome
  const settledAgo = Math.max(0, Math.floor((now - consensus.ts) / 1000))
  const finalColor = final === 'YES' ? 'text-[#3c8aff] bg-[#3c8aff]/10' : 'text-[#fc401f] bg-[#fc401f]/10'

  return (
    <div className="rounded-2xl border border-[#c2c8d4] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-[0.22em] text-[#b1b7c3]">LATEST CONSENSUS</span>
            {consensus.betId !== null && (
              <span className="rounded border border-[#c2c8d4] px-1.5 py-0.5 font-mono text-[9px] tracking-[0.14em] text-[#717886]">
                #{consensus.betId}
              </span>
            )}
            <span className="font-mono text-[9px] tracking-[0.14em] text-[#b1b7c3]">
              {settledAgo < 60 ? `${settledAgo}s ago` : `${Math.floor(settledAgo / 60)}m ago`}
            </span>
          </div>
          <div className="mt-1 truncate font-mono text-[11px] text-[#32353d]" title={consensus.question}>
            {consensus.question}
          </div>
        </div>
        <div className={`rounded-md px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.2em] ${finalColor}`}>
          {final}
        </div>
      </div>

      <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-[#e0e4eb]">
        <div className="bg-[#fc401f] transition-all" style={{ width: `${noPct}%` }} />
        <div className="bg-[#3c8aff] transition-all" style={{ width: `${100 - noPct}%` }} />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] tabular-nums text-[#717886]">
        <span>NO {consensus.noWeight.toFixed(2)}</span>
        <span>YES {consensus.yesWeight.toFixed(2)}</span>
      </div>

      <div className="mt-5 space-y-1.5">
        {consensus.perOracle.map((v) => (
          <div
            key={v.oracleId}
            className="grid grid-cols-[28px_1fr_54px_40px_80px] items-center gap-2 font-mono text-[11px]"
          >
            <span className="text-lg leading-none">{v.emoji}</span>
            <span className="truncate text-[#32353d] capitalize" title={v.reasoning}>
              {v.dataSource}
            </span>
            <span className={v.verdict === 'YES' ? 'text-[#3c8aff]' : 'text-[#fc401f]'}>
              {v.verdict}
            </span>
            <span className="text-right tabular-nums text-[#717886]">{v.confidence.toFixed(2)}</span>
            <TxLink
              tx={v.verdictTxHash}
              className="text-right font-mono text-[10px] tabular-nums text-[#b1b7c3]"
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg bg-[#eef0f3] px-3 py-2.5 font-mono text-[10px] leading-[1.6] text-[#717886]">
        <span>
          {consensus.totalNanopayments + 50} nanopays · ${consensus.totalSpentUsdc.toFixed(4)} settled
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-[#b1b7c3]">resolve tx</span>
          <TxLink tx={consensus.resolutionTxHash} />
        </span>
      </div>
    </div>
  )
}
