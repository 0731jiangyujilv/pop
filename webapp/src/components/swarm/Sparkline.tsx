type Props = {
  data: number[]
  width?: number
  height?: number
  max?: number
  accent?: string
  dim?: boolean
}

export function Sparkline({ data, width = 220, height = 40, max, accent = '#3c8aff', dim = false }: Props) {
  if (data.length === 0) return null
  const peak = max ?? Math.max(...data, 1)
  const step = width / Math.max(data.length - 1, 1)

  const points = data.map((v, i) => {
    const x = i * step
    const y = height - (Math.min(v, peak) / peak) * height
    return [x, y] as const
  })

  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${path} L${width.toFixed(1)},${height} L0,${height} Z`

  const lastVal = data[data.length - 1]
  const lastColor = dim
    ? '#717886'
    : lastVal > peak * 0.75
      ? '#fc401f'
      : lastVal > peak * 0.5
        ? '#ffd12f'
        : accent

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={`grad-${accent}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity={dim ? 0.05 : 0.35} />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#grad-${accent})`} />
      <path d={path} fill="none" stroke={dim ? '#dee1e7' : accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {!dim && points.length > 0 && (
        <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="2.5" fill={lastColor}>
          <animate attributeName="r" values="2.5;4;2.5" dur="1.6s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  )
}
