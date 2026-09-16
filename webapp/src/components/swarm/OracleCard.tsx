import { useEffect, useState } from 'react'
import type { OracleNode } from '@/types/swarm'
import { arcAddressLink, arcContractReadLink } from '@/lib/explorer'
import { Sparkline } from './Sparkline'

type Props = {
  node: OracleNode
  pulse: boolean
  killed: boolean
  onToggleKill: () => void
}

const STATUS_META: Record<OracleNode['status'], { label: string; dot: string; ring: string; text: string }> = {
  healthy: {
    label: 'LIVE',
    dot: 'bg-[#66c800]',
    ring: 'border-[#66c800]/50',
    text: 'text-[#66c800]',
  },
  degraded: {
    label: 'SLOW',
    dot: 'bg-[#ffd12f]',
    ring: 'border-[#ffd12f]/50',
    text: 'text-[#5b616e]',
  },
  offline: {
    label: 'OFFLINE',
    dot: 'bg-[#fc401f]',
    ring: 'border-[#fc401f]/50',
    text: 'text-[#fc401f]',
  },
}

function fmtUptime(sec: number): string {
  if (sec < 60) return `${Math.floor(sec)}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.floor(sec % 60)}s`
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h}h ${m.toString().padStart(2, '0')}m`
}

function fmtAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function HeartbeatAgo({ ts }: { ts: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  const diff = Math.max(0, (now - ts) / 1000)
  return <span className="tabular-nums">{diff.toFixed(1)}s</span>
}

function AccuracyBar({ value, offline }: { value: number; offline: boolean }) {
  const cells = 12
  const filled = Math.round(value * cells)
  return (
    <div style={{display: 'none'}} className="flex items-center gap-2">
      <span className="font-mono text-[10px] tracking-[0.12em] text-slate-400">ACCURACY</span>
      <div className="flex gap-[2px] font-mono text-[11px] leading-none">
        {Array.from({ length: cells }).map((_, i) => {
          const on = i < filled
          const color = offline
            ? 'text-slate-300'
            : on
              ? value > 0.85
                ? 'text-[#10F3B5]'
                : value > 0.7
                  ? 'text-[#FFC44D]'
                  : 'text-[#FF3B5C]'
              : 'text-slate-200'
          return (
            <span key={i} className={color}>
              █
            </span>
          )
        })}
      </div>
      <span className={`font-mono text-[11px] tabular-nums ${offline ? 'text-slate-400' : 'text-slate-700'}`}>
        {Math.round(value * 100)}%
      </span>
    </div>
  )
}

export function OracleCard({ node, pulse, killed, onToggleKill }: Props) {
  const [pulseKey, setPulseKey] = useState(0)
  useEffect(() => {
    if (pulse) setPulseKey((k) => k + 1)
  }, [pulse])

  const status = STATUS_META[node.status]
  const offline = node.status === 'offline'
  const accent = node.status === 'healthy' ? '#66c800' : node.status === 'degraded' ? '#ffd12f' : '#fc401f'

  return (
    <div
      className={`relative rounded-2xl border bg-white p-5 transition-all ${status.ring} ${
        offline ? 'animate-[offline-breath_2.4s_ease-in-out_infinite]' : ''
      }`}
    >
      {/* Pulse ring on heartbeat */}
      {pulse && !offline && (
        <span
          key={pulseKey}
          className="pointer-events-none absolute -inset-px rounded-2xl ring-2 ring-[#66c800]/60 animate-[card-pulse_1.1s_ease-out]"
        />
      )}

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#f2f4f7] text-2xl ring-1 ring-[#c2c8d4]">
              <span style={{ filter: offline ? 'grayscale(1) opacity(0.4)' : 'none' }}>{node.emoji}</span>
            </div>
            <div className="min-w-0">
              <div className="font-mono text-[11px] font-semibold tracking-[0.18em] text-[#0a0b0d]">
                {node.name.toUpperCase()}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-[#717886]">{node.id}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${status.dot} ${offline ? '' : 'animate-pulse'}`} />
            <span className={`font-mono text-[10px] tracking-[0.2em] ${status.text}`}>● {status.label}</span>
          </div>
        </div>

        <div className="mt-1.5 font-mono text-[10.5px] tracking-wide text-[#717886]">{node.tagline}</div>

        {/* ERC-8004 identity + reputation badge */}
        {(node.agentTokenId || typeof node.reputation === 'number') && (
          <div className="mt-2.5 flex items-center gap-2 font-mono text-[9px] tracking-[0.18em]">
            {(() => {
              const registryLink = arcContractReadLink(node.registryAddress) ?? arcAddressLink(node.registryAddress)
              const LabelTag = registryLink ? 'a' : 'span'
              return (
                <LabelTag
                  {...(registryLink
                    ? { href: registryLink, target: '_blank', rel: 'noopener noreferrer', title: 'OracleRegistry on Arc' }
                    : {})}
                  className={`rounded-sm border border-[#0000ff]/25 bg-[#0000ff]/5 px-1.5 py-0.5 text-[#0000ff] ${
                    registryLink ? 'transition hover:border-[#0000ff]/60 hover:bg-[#0000ff]/20' : ''
                  }`}
                >
                  ERC-8004
                </LabelTag>
              )
            })()}
            {node.agentTokenId ? (
              (() => {
                const readLink = arcContractReadLink(node.registryAddress)
                const inner = (
                  <>
                    ID <span className="tabular-nums text-[#32353d]">#{node.agentTokenId}</span>
                  </>
                )
                return readLink ? (
                  <a
                    href={readLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`read agents(${node.agentTokenId}) on Arc`}
                    className="text-[#717886] transition hover:text-[#32353d]"
                  >
                    {inner}
                  </a>
                ) : (
                  <span className="text-[#717886]">{inner}</span>
                )
              })()
            ) : (
              <span className="text-[#b1b7c3]">unregistered</span>
            )}
            {typeof node.reputation === 'number' && (
              (() => {
                const readLink = arcContractReadLink(node.registryAddress)
                const repColor =
                  node.reputation > 0
                    ? 'text-[#66c800]'
                    : node.reputation < 0
                      ? 'text-[#fc401f]'
                      : 'text-[#32353d]'
                const inner = (
                  <>
                    REP{' '}
                    <span className={`tabular-nums ${repColor}`}>
                      {node.reputation > 0 ? '+' : ''}
                      {node.reputation}
                    </span>
                  </>
                )
                return readLink ? (
                  <a
                    href={readLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`read reputation(${node.agentTokenId ?? '…'}) on Arc`}
                    className="text-[#32353d] transition hover:text-[#0a0b0d]"
                  >
                    {inner}
                  </a>
                ) : (
                  <span className="text-[#32353d]">{inner}</span>
                )
              })()
            )}
          </div>
        )}

        <div className="mt-5 h-px w-full bg-gradient-to-r from-transparent via-[#c2c8d4] to-transparent" />

        {/* Latency sparkline */}
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-[0.14em] text-[#b1b7c3]">LATENCY · ms</span>
            <span className={`font-mono text-[11px] tabular-nums ${offline ? 'text-[#b1b7c3]' : 'text-[#32353d]'}`}>
              {offline ? '—' : `${Math.round(node.selfLatencyMs)}`}
            </span>
          </div>
          <div className="mt-2">
            <Sparkline data={node.latencyHistory} accent={accent} dim={offline} height={36} width={260} />
          </div>
        </div>

        {/* Earnings & metrics grid */}
        <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3">
          <div>
            <div className="font-mono text-[10px] tracking-[0.14em] text-[#b1b7c3]">EARNINGS · 24H</div>
            <div className={`mt-1 font-mono text-[15px] font-semibold tabular-nums ${offline ? 'text-[#b1b7c3]' : 'text-[#0a0b0d]'}`}>
              ${node.earnings24hUsdc.toFixed(5)}
              <span className="ml-1 text-[10px] text-[#b1b7c3]">USDC</span>
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] tracking-[0.14em] text-[#b1b7c3]">BALANCE</div>
            <div className={`mt-1 font-mono text-[15px] font-semibold tabular-nums ${offline ? 'text-[#b1b7c3]' : 'text-[#32353d]'}`}>
              ${node.walletBalanceUsdc.toFixed(4)}
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] tracking-[0.14em] text-[#b1b7c3]">QUERIES · 1H</div>
            <div className={`mt-1 font-mono text-[15px] font-semibold tabular-nums ${offline ? 'text-[#b1b7c3]' : 'text-[#0a0b0d]'}`}>
              {node.queries1h}
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] tracking-[0.14em] text-[#b1b7c3]">EVIDENCE · 24H</div>
            <div className={`mt-1 font-mono text-[15px] font-semibold tabular-nums ${offline ? 'text-[#b1b7c3]' : 'text-[#0a0b0d]'}`}>
              {node.evidenceServed24h.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <AccuracyBar value={node.accuracy} offline={offline} />
        </div>

        <div className="mt-5 h-px w-full bg-[#e8ecf2]" />

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between font-mono text-[10px]">
          <div className="flex items-center gap-1.5 text-[#b1b7c3]">
            <span className={`inline-block h-1 w-1 rounded-full ${offline ? 'bg-[#b1b7c3]' : 'bg-[#66c800]'}`} />
            <span>uptime</span>
            <span className={`tabular-nums ${offline ? 'text-[#b1b7c3]' : 'text-[#32353d]'}`}>
              {fmtUptime(node.uptimeSec)}
            </span>
          </div>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="flex items-center gap-1.5 text-[#b1b7c3] transition hover:text-[#32353d]"
            title={node.walletAddress}
          >
            <span>wallet</span>
            <span className={`tabular-nums ${offline ? 'text-[#b1b7c3]' : 'text-[#32353d]'}`}>
              {fmtAddr(node.walletAddress)}
            </span>
          </a>
        </div>

        <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-[#b1b7c3]">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-1 w-1 rounded-full bg-[#66c800] animate-pulse" />
            <span>heartbeat</span>
            <HeartbeatAgo ts={node.lastHeartbeatAt} />
            <span>ago</span>
          </div>
          <button
            onClick={() => {
              const cmd = `pm2 ${killed ? 'restart' : 'stop'} ${node.id}`
              if (navigator.clipboard) navigator.clipboard.writeText(cmd).catch(() => {})
              onToggleKill()
            }}
            title={`copy: pm2 ${killed ? 'restart' : 'stop'} ${node.id}`}
            className={`group cursor-pointer rounded px-2 py-0.5 font-mono text-[9px] tracking-[0.15em] transition ${
              killed
                ? 'bg-[#66c800]/15 text-[#66c800] hover:bg-[#66c800]/25'
                : 'bg-[#f2f4f7] text-[#717886] hover:bg-[#e8ecf2] hover:text-[#32353d]'
            }`}
          >
            {killed ? '◉ COPY pm2 restart' : '◌ COPY pm2 stop'}
          </button>
        </div>
      </div>
    </div>
  )
}
