import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}

export function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}

export function formatPrice(price: bigint, decimals = 8): string {
  const divisor = 10n ** BigInt(decimals)
  const whole = price / divisor
  const frac = price % divisor
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 2)
  return `${whole}.${fracStr}`
}

export function formatUsdc(amount: bigint): string {
  const whole = amount / 1_000_000n
  const frac = (amount % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : `${whole}`
}

// Format 1e18-scaled probability to "54.74"
export function formatProbability(prob: bigint): string {
  const pct = (prob * 10000n) / BigInt(1e18)
  const whole = pct / 100n
  const frac = (pct % 100n).toString().padStart(2, '0')
  return `${whole}.${frac}`
}

export function shareOnXUrl(text: string, url?: string): string {
  const params = new URLSearchParams()
  params.set('text', text)
  if (url) params.set('url', url)
  return `https://x.com/intent/tweet?${params.toString()}`
}
