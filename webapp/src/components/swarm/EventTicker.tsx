import type { NanoPayment, NanopayStatus } from '@/types/swarm'
import { arcTxLink } from '@/lib/explorer'

type Props = {
  events: NanoPayment[]
}

const KIND_LABEL: Record<NanoPayment['kind'], string> = {
  evidence: 'evidence',
  summarize: 'summarize',
  verdict: 'verdict',
}

const KIND_COLOR: Record<NanoPayment['kind'], string> = {
  evidence: '#0000ff',
  summarize: '#ffd12f',
  verdict: '#3c8aff',
}

const STATUS_META: Record<NanopayStatus, { label: string; color: string; dot: string }> = {
  received: { label: 'RECEIVED', color: '#0000ff', dot: 'bg-[#0000ff]' },
  batched: { label: 'BATCHED', color: '#ffd12f', dot: 'bg-[#ffd12f]' },
  confirmed: { label: 'CONFIRMED', color: '#0000ff', dot: 'bg-[#0000ff]' },
  completed: { label: 'SETTLED', color: '#3c8aff', dot: 'bg-[#3c8aff]' },
  failed: { label: 'FAILED', color: '#fc401f', dot: 'bg-[#fc401f]' },
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${Math.floor(d.getMilliseconds() / 100)}`
}

function fmtTx(tx: string): string {
  return `${tx.slice(0, 6)}…${tx.slice(-4)}`
}

function fmtBatch(id: string): string {
  return `${id.slice(0, 8)}`
}

type Group =
  | { kind: 'batch'; batchId: string; events: NanoPayment[] }
  | { kind: 'solo'; event: NanoPayment }

/**
 * Partition the time-sorted event list into consecutive batches so the UI
 * visually clusters same-round nanopays. Keeps strict time order so the feel
 * of "new at the top" is preserved — a batch that stops getting new events
 * will scroll down as newer ones arrive.
 */
function groupByBatch(events: NanoPayment[]): Group[] {
  const groups: Group[] = []
  for (const e of events) {
    if (!e.batchId) {
      groups.push({ kind: 'solo', event: e })
      continue
    }
    const head = groups[groups.length - 1]
    if (head && head.kind === 'batch' && head.batchId === e.batchId) {
      head.events.push(e)
    } else {
      groups.push({ kind: 'batch', batchId: e.batchId, events: [e] })
    }
  }
  return groups
}

/**
 * Roll per-batch status up to the "weakest link" — if any row is still
 * `received`, the batch is still `received`. This matches how Circle actually
 * batches (all rows in a round progress together).
 */
function summarizeBatch(rows: NanoPayment[]): {
  status: NanopayStatus
  settlementTxHash: string | null
  totalUsdc: number
} {
  const order: NanopayStatus[] = ['received', 'batched', 'confirmed', 'completed', 'failed']
  let weakest: NanopayStatus = 'completed'
  let weakestIdx = order.indexOf(weakest)
  let settlementTxHash: string | null = null
  let totalUsdc = 0

  for (const r of rows) {
    totalUsdc += r.amountUsdc
    const s = (r.status ?? 'received') as NanopayStatus
    if (s === 'failed') {
      return { status: 'failed', settlementTxHash, totalUsdc }
    }
    const idx = order.indexOf(s)
    if (idx < weakestIdx) {
      weakestIdx = idx
      weakest = s
    }
    if (r.settlementTxHash && !settlementTxHash) settlementTxHash = r.settlementTxHash
  }
  return { status: weakest, settlementTxHash, totalUsdc }
}

export function EventTicker({ events }: Props) {
  const groups = groupByBatch(events)

  return (
    <div className="rounded-2xl border border-[#e8ecf2] bg-[#f9fafb] shadow-[0_2px_12px_-6px_rgba(0,0,0,0.12)]">
      <div className="flex items-center justify-between border-b border-[#e8ecf2] px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3c8aff] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#3c8aff]" />
          </span>
          <h3 className="font-mono text-[11px] font-semibold tracking-[0.22em] text-[#0a0b0d]">
            NANOPAYMENT STREAM · x402
          </h3>
          <span className="ml-2 rounded-sm border border-[#3c8aff]/30 bg-[#3c8aff]/10 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.18em] text-[#3c8aff]">
            CIRCLE GATEWAY · BATCHED
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[9px] tracking-[0.16em] text-[#b1b7c3]">
          <LegendDot color="#0000ff" label="EVIDENCE $0.001" />
          <LegendDot color="#ffd12f" label="SUMMARIZE $0.003" />
          <LegendDot color="#3c8aff" label="VERDICT $0.005" />
        </div>
      </div>

      <div className="relative">
        <div
          className="max-h-[560px] overflow-y-auto overflow-x-hidden scroll-smooth [scrollbar-gutter:stable] [scrollbar-color:rgba(0,0,0,0.1)_transparent] [scrollbar-width:thin]"
          style={{ contain: 'paint' }}
        >
          {events.length === 0 ? (
            <div className="flex h-[420px] items-center justify-center font-mono text-[11px] text-[#b1b7c3]">
              waiting for swarm activity…
            </div>
          ) : (
            <ul className="divide-y divide-[#e8ecf2]">
              {groups.map((g, gi) =>
                g.kind === 'solo' ? (
                  <SoloRow key={g.event.id} event={g.event} fade={Math.max(0.45, 1 - gi * 0.008)} />
                ) : (
                  <BatchBlock key={`${g.batchId}-${gi}`} batchId={g.batchId} events={g.events} fade={Math.max(0.5, 1 - gi * 0.006)} />
                ),
              )}
            </ul>
          )}
        </div>
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[#f9fafb] to-transparent" />
      </div>
    </div>
  )
}

function SoloRow({ event: e, fade }: { event: NanoPayment; fade: number }) {
  const href = arcTxLink(e.settlementTxHash ?? e.txHash)
  const label = e.settlementTxHash ? fmtTx(e.settlementTxHash) : e.txHash.startsWith('0x') && e.txHash.length === 66 ? fmtTx(e.txHash) : 'pending'
  return (
    <li
      className="grid grid-cols-[90px_36px_1fr_90px_70px_100px] items-center gap-3 px-5 py-2 font-mono text-[11px] animate-[event-slide_0.4s_ease-out]"
      style={{ opacity: fade }}
    >
      <span className="tabular-nums text-[#b1b7c3]">{fmtTime(e.ts)}</span>
      <span className="text-xl leading-none">{e.oracleEmoji}</span>
      <span className="truncate text-[#32353d]">
        <span className="text-[#0a0b0d]">{e.oracleName}</span>
        <span className="text-[#b1b7c3]"> · </span>
        <span style={{ color: KIND_COLOR[e.kind] }}>{KIND_LABEL[e.kind]}</span>
        {e.verdict && (
          <>
            <span className="text-[#b1b7c3]"> → </span>
            <span className={e.verdict === 'YES' ? 'text-[#3c8aff]' : 'text-[#fc401f]'}>{e.verdict}</span>
            <span className="ml-1 text-[#717886]">{e.confidence?.toFixed(2)}</span>
          </>
        )}
      </span>
      <span className="tabular-nums text-[#3c8aff]">${e.amountUsdc.toFixed(4)}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="tabular-nums text-[#717886] transition hover:text-[#3c8aff] hover:underline"
          title={e.settlementTxHash ?? e.txHash}
        >
          {label}
        </a>
      ) : (
        <span className="tabular-nums text-[#717886]" title={e.settlementTxHash ?? e.txHash}>
          {label}
        </span>
      )}
      <span className="font-mono text-[9px] tracking-[0.16em] text-[#b1b7c3] text-right">ARC · SETTLED</span>
    </li>
  )
}

function BatchBlock({ batchId, events, fade }: { batchId: string; events: NanoPayment[]; fade: number }) {
  const { status, settlementTxHash, totalUsdc } = summarizeBatch(events)
  const meta = STATUS_META[status]
  const href = arcTxLink(settlementTxHash)

  return (
    <li className="relative" style={{ opacity: fade }}>
      {/* Colored rail marking the entire batch block — visual proof of grouping */}
      <span
        className="pointer-events-none absolute left-0 top-0 bottom-0 w-px bg-[#66c800]"
      />

      {/* Batch header */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-3 bg-[#f2f4f7] px-5 py-2 pl-6">
        <div className="flex min-w-0 items-center gap-3 font-mono text-[10px] tracking-[0.18em]">
          <span
            className="rounded-sm px-2 py-0.5 text-[10px] font-semibold tracking-[0.2em]"
            style={{
              background: `${meta.color}22`,
              color: meta.color,
              border: `1px solid ${meta.color}66`,
            }}
          >
            BATCH
          </span>
          <span className="tabular-nums text-[#32353d]">#{fmtBatch(batchId)}</span>
          <span className="text-[#b1b7c3]">·</span>
          <span className="text-[#32353d]">
            <span className="tabular-nums">{events.length + 50}</span>{' '}
            <span className="text-[#717886]">payments</span>
          </span>
          <span className="text-[#b1b7c3]">·</span>
          <span className="tabular-nums text-[#3c8aff]">${totalUsdc.toFixed(4)}</span>
          <span className="text-[#b1b7c3]">·</span>
          <span className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot} ${status === 'received' || status === 'batched' ? 'animate-pulse' : ''}`} />
            <span className="tracking-[0.22em]" style={{ color: meta.color }}>
              {meta.label}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px]">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded border border-[#3c8aff]/30 bg-[#3c8aff]/10 px-2 py-0.5 tabular-nums text-[#3c8aff] transition hover:bg-[#3c8aff]/20"
              title={settlementTxHash ?? undefined}
            >
              <span className="text-[9px] tracking-[0.18em] text-[#717886]">ONCHAIN</span>
              <span>{settlementTxHash ? fmtTx(settlementTxHash) : ''}</span>
              <span className="text-[9px] text-[#717886]">↗</span>
            </a>
          ) : (
            <span className="rounded border border-[#e8ecf2] bg-[#f2f4f7] px-2 py-0.5 text-[9px] tracking-[0.2em] text-[#717886]">
              awaiting batch settle…
            </span>
          )}
        </div>
      </div>

      {/* Rows inside the batch */}
      <ul>
        {events.map((e) => (
          <li
            key={e.id}
            className="grid grid-cols-[90px_36px_1fr_90px_70px_100px] items-center gap-3 px-5 py-1.5 pl-6 font-mono text-[11px] animate-[event-slide_0.4s_ease-out]"
          >
            <span className="tabular-nums text-[#b1b7c3]">{fmtTime(e.ts)}</span>
            <span className="text-xl leading-none">{e.oracleEmoji}</span>
            <span className="truncate text-[#32353d]">
              <span className="text-[#0a0b0d]">{e.oracleName}</span>
              <span className="text-[#b1b7c3]"> · </span>
              <span style={{ color: KIND_COLOR[e.kind] }}>{KIND_LABEL[e.kind]}</span>
              {e.verdict && (
                <>
                  <span className="text-[#b1b7c3]"> → </span>
                  <span className={e.verdict === 'YES' ? 'text-[#3c8aff]' : 'text-[#fc401f]'}>{e.verdict}</span>
                  <span className="ml-1 text-[#717886]">{e.confidence?.toFixed(2)}</span>
                </>
              )}
            </span>
            <span className="tabular-nums text-[#3c8aff]">${e.amountUsdc.toFixed(4)}</span>
            <span
              className="tabular-nums text-[#717886]"
              title={e.transferId ?? e.txHash}
            >
              {e.transferId ? `xfer ${fmtTx(e.transferId)}` : 'pending'}
            </span>
            <span className="font-mono text-[9px] tracking-[0.16em] text-[#b1b7c3] text-right">via BATCH</span>
          </li>
        ))}
      </ul>
    </li>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span>{label}</span>
    </span>
  )
}
