import type { ProbPoint, ScenarioMarker } from '@/data/robinhoodLiveEvidence'

export function ProbSparkline({
  path,
  markers,
  tone,
  label,
}: {
  path: readonly ProbPoint[]
  markers?: readonly ScenarioMarker[]
  tone: 'fair' | 'toxic'
  label: string
}) {
  const W = 560
  const H = 120
  const pad = 12
  const values = path.map((p) => p.percent)
  const lo = Math.min(...values) - 1
  const hi = Math.max(...values) + 1
  const span = Math.max(0.01, hi - lo)
  const x = (i: number) =>
    pad + (path.length <= 1 ? 0 : (i * (W - pad * 2)) / (path.length - 1))
  const y = (v: number) => pad + (H - pad * 2) * (1 - (v - lo) / span)
  const d = path
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.percent).toFixed(1)}`)
    .join(' ')
  const area =
    path.length > 1
      ? `${d} L${x(path.length - 1).toFixed(1)},${H - 2} L${x(0).toFixed(1)},${H - 2} Z`
      : ''

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="rh-spark" role="img" aria-label={label}>
      {area && <path className={`rh-spark-area-${tone}`} d={area} />}
      <path className={`rh-spark-line rh-spark-${tone}`} d={d} />
      {markers?.map((m) => {
        const idx = path.findIndex((p) => Math.abs(p.percent - m.afterPercent) < 0.001)
        if (idx < 0) return null
        const fill =
          m.kind === 'shock' ? '#FF9500' : m.kind === 'reverted' ? '#15803d' : 'rgb(233,21,45)'
        return (
          <circle
            key={`${m.kind}-${m.afterPercent}`}
            className="rh-spark-mark"
            cx={x(idx)}
            cy={y(path[idx].percent)}
            r={5}
            fill={fill}
          />
        )
      })}
    </svg>
  )
}

export function ProbPath({
  path,
  markAt,
  markClass,
}: {
  path: readonly ProbPoint[]
  markAt?: number
  markClass?: string
}) {
  return (
    <div className="rh-path" aria-hidden={false}>
      {path.map((p, i) => {
        const marked = markAt !== undefined && Math.abs(p.percent - markAt) < 0.001
        return (
          <span key={`${p.percent}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && <span className="rh-path-arrow">→</span>}
            <span className={`rh-path-step${marked && markClass ? ` ${markClass}` : ''}`}>
              {p.percent.toFixed(2)}
            </span>
          </span>
        )
      })}
    </div>
  )
}
