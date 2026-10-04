/** 25 USDG at 6 decimals — bounded demo approval, not unlimited. */
export const USDG_APPROVAL_CAP = 25_000_000n

/**
 * Amount to approve for a trade, or `null` when existing allowance already covers it.
 * Cap is 25 USDG; larger trades approve exactly the requested amount.
 */
export function nextApprovalAmount(
  allowance: bigint,
  need: bigint,
  cap: bigint = USDG_APPROVAL_CAP,
): bigint | null {
  if (allowance >= need) return null
  return need > cap ? need : cap
}
