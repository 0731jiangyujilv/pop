const ARC_EXPLORER_BASE =
  (import.meta.env.VITE_ARC_EXPLORER_URL as string | undefined)?.replace(/\/$/, '') ??
  'https://testnet.arcscan.app'

export function arcAddressLink(address: string | undefined | null): string | null {
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return null
  return `${ARC_EXPLORER_BASE}/address/${address}`
}

export function arcTxLink(txHash: string | undefined | null): string | null {
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return null
  return `${ARC_EXPLORER_BASE}/tx/${txHash}`
}

/** Link to the contract's Read tab — lets the viewer call `agents(id)` / `reputation(id)` directly */
export function arcContractReadLink(address: string | undefined | null): string | null {
  const base = arcAddressLink(address)
  return base ? `${base}#readContract` : null
}

export function shortAddr(addr: string, left = 6, right = 4): string {
  if (!addr || addr.length < left + right) return addr
  return `${addr.slice(0, left)}…${addr.slice(-right)}`
}
