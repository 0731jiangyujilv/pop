import { formatUnits } from 'viem'
import { LIVE_ACCOUNTING } from '../data/robinhoodLiveEvidence.ts'

/** Normalize USDG amount for display; keep integer zero as `"0"`. */
export function formatLiveUsdg(v: bigint | undefined): string | undefined {
  if (v === undefined) return undefined
  if (v === 0n) return '0'
  const raw = formatUnits(v, 6)
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  return n.toFixed(6).replace(/\.?0+$/, '')
}

/** Static fallback copy when live RPC is unavailable — never fabricate live zeroes. */
export function settledEvidenceFallback() {
  return {
    ...LIVE_ACCOUNTING,
    note: 'Live RPC unavailable — showing immutable settled-demo evidence.',
  }
}
