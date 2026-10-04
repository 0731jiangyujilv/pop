/**
 * Metric display helper. Intentionally static: prefers-reduced-motion and the
 * active lint rules make imperative count-up effects more trouble than they are
 * worth for the judge surface. Visual motion lives in CSS sparkline draws.
 */
export function CountUp({
  value,
  decimals = 0,
  suffix = '',
}: {
  value: number
  decimals?: number
  durationMs?: number
  suffix?: string
}) {
  return (
    <>
      {value.toFixed(decimals)}
      {suffix}
    </>
  )
}
