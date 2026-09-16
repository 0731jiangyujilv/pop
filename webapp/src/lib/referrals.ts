import { apiFetch } from './api'

const REFERRAL_CODE_KEY = 'pop_referral_code'

export function captureReferralCode(search: string): string | null {
  const code = new URLSearchParams(search).get('ref')?.trim()
  if (!code) return null
  localStorage.setItem(REFERRAL_CODE_KEY, code.toUpperCase())
  return code
}

export function getPendingReferralCode(): string | null {
  return localStorage.getItem(REFERRAL_CODE_KEY)
}

export function clearPendingReferralCode(): void {
  localStorage.removeItem(REFERRAL_CODE_KEY)
}

export async function connectPendingReferral(source = 'web'): Promise<void> {
  const code = getPendingReferralCode()
  if (!code) return

  const res = await apiFetch('/api/referrals/connect', {
    method: 'POST',
    body: JSON.stringify({ code, source }),
  })

  if (res.ok || res.status === 400) {
    clearPendingReferralCode()
  }
}

export async function recordReferralTrade(params: {
  chainId: number
  marketAddress: `0x${string}`
  txHash: `0x${string}`
}): Promise<void> {
  const res = await apiFetch('/api/referrals/trade', {
    method: 'POST',
    body: JSON.stringify(params),
  })

  if (!res.ok && res.status !== 401) {
    const body = await res.json().catch(() => ({}))
    console.warn('Referral trade attribution failed:', body.error || res.status)
  }
}
