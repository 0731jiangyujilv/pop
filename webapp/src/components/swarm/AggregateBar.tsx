import { useEffect, useRef, useState } from 'react'
import type { SwarmAggregate } from '@/types/swarm'

type Props = {
  aggregate: SwarmAggregate
  pulseTick: { nodeId: string; at: number } | null
  nodeOrder: string[]
}

type Blip = { id: string; x: number; at: number }

export function AggregateBar({ aggregate, pulseTick, nodeOrder }: Props) {
  const [blips, setBlips] = useState<Blip[]>([])
  const lastTick = useRef<number>(0)

  useEffect(() => {
    if (!pulseTick) return
    if (pulseTick.at === lastTick.current) return
    lastTick.current = pulseTick.at
    const idx = nodeOrder.indexOf(pulseTick.nodeId)
    if (idx < 0) return
    const x = ((idx + 0.5) / nodeOrder.length) * 100
    const blip: Blip = { id: `${pulseTick.at}-${pulseTick.nodeId}`, x, at: pulseTick.at }
    setBlips((curr) => [...curr.slice(-20), blip])
    const timer = setTimeout(() => {
      setBlips((curr) => curr.filter((b) => b.id !== blip.id))
    }, 1800)
    return () => clearTimeout(timer)
  }, [pulseTick, nodeOrder])

  return (
    <div className="relative rounded-2xl border border-[#c2c8d4] bg-white px-6 py-5 shadow-[0_2px_12px_-6px_rgba(0,0,0,0.12)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#66c800] opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#66c800]" />
            </span>
            <span className="font-mono text-[11px] font-semibold tracking-[0.22em] text-[#0a0b0d]">
              ORACLE SWARM · LIVE
            </span>
          </div>
          <span className="hidden h-4 w-px bg-[#c2c8d4] md:block" />
          <div className="font-mono text-[10px] tracking-[0.14em] text-[#717886]">
            CHAIN <span className="text-[#0000ff]">ARC</span> · BLOCK{' '}
            <span className="tabular-nums text-[#32353d]">{aggregate.arcBlock.toLocaleString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <Stat label="ONLINE" value={`${aggregate.onlineCount}/${aggregate.totalCount}`} accent={aggregate.onlineCount === aggregate.totalCount ? '#66c800' : '#ffd12f'} />
          <Stat label="QUERIES · 1H" value={aggregate.queries1h.toLocaleString()} />
          <Stat label="EVIDENCE · 24H" value={aggregate.evidenceServed24h.toLocaleString()} />
          <Stat label="NANOPAYS" value={aggregate.totalNanoPayments.toLocaleString()} accent="#0000ff" />
          <Stat label="EARNED · 24H" value={`$${aggregate.totalEarnings24hUsdc.toFixed(4)}`} accent="#3c8aff" />
        </div>
      </div>

      {/* Pulse lane */}
      <div className="relative mt-5 h-6 overflow-hidden rounded-md bg-[#f2f4f7] ring-1 ring-[#c2c8d4]">
        {/* tick marks for each node */}
        {nodeOrder.map((_, i) => (
          <div
            key={i}
            className="absolute top-0 h-full w-px bg-[#c2c8d4]"
            style={{ left: `${((i + 0.5) / nodeOrder.length) * 100}%` }}
          />
        ))}
        {/* scrolling gridlines (ECG feel) */}
        <div className="pointer-events-none absolute inset-0 opacity-80 bg-[linear-gradient(90deg,transparent_0,transparent_calc(100%/24),rgba(20,20,20,0.10)_calc(100%/24),rgba(20,20,20,0.10)_calc(100%/24+1px),transparent_calc(100%/24+1px))] bg-[length:calc(100%/24)_100%]" />
        {/* center baseline */}
        <div className="absolute top-1/2 left-0 right-0 h-px bg-[#c2c8d4]" />
        {/* blips */}
        {blips.map((b) => (
          <div
            key={b.id}
            className="absolute top-0 bottom-0 flex items-center justify-center animate-[blip-fade_1.8s_ease-out_forwards]"
            style={{ left: `calc(${b.x}% - 14px)`, width: 28 }}
          >
            <svg viewBox="0 0 40 24" className="h-full w-full">
              <path
                d="M0 12 L10 12 L13 4 L17 20 L21 2 L25 18 L28 12 L40 12"
                fill="none"
                stroke="#66c800"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value, accent = '#0a0b0d' }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[9px] tracking-[0.18em] text-[#b1b7c3]">{label}</span>
      <span className="mt-0.5 font-mono text-[13px] font-semibold tabular-nums" style={{ color: accent }}>
        {value}
      </span>
    </div>
  )
}
