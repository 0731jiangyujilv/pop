import { getAddress, type PublicClient } from "viem"
import { BetAbi } from "./blockchain"

/**
 * Resolve the `decimals()` of the price feed behind a Bet contract.
 *
 * Different assets may use oracles with different scales (e.g. 8 for most
 * Chainlink-style feeds, 18 for some custom feeds). Bot code that formats
 * startPrice/endPrice must read the decimals dynamically rather than assume
 * a hard-coded 8 — otherwise displays are off by orders of magnitude on
 * non-8 feeds.
 *
 * Results are memoised per feed address (immutable) and per bet contract
 * address (also immutable — each Bet pins one feed at construction time).
 */
const FEED_DECIMALS_ABI = [
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
] as const

const feedDecimalsCache = new Map<string, number>()
const betFeedCache = new Map<string, `0x${string}`>()

/** Clear caches — tests only. */
export function _resetFeedDecimalsCacheForTests() {
  feedDecimalsCache.clear()
  betFeedCache.clear()
}

/** Fetch and cache the `decimals()` of a specific feed address. */
export async function getFeedDecimals(
  client: PublicClient,
  feedAddress: `0x${string}`,
  fallback = 8,
): Promise<number> {
  const key = getAddress(feedAddress)
  const cached = feedDecimalsCache.get(key)
  if (cached !== undefined) return cached

  try {
    const raw = (await client.readContract({
      address: key,
      abi: FEED_DECIMALS_ABI,
      functionName: "decimals",
    })) as number | bigint
    const decimals = Number(raw)
    feedDecimalsCache.set(key, decimals)
    return decimals
  } catch {
    return fallback
  }
}

/**
 * Resolve the feed decimals behind a Bet contract in one helper.
 * Reads `Bet.priceFeed()` (immutable) once per bet, then falls through to
 * the feed-level cache.
 */
export async function getFeedDecimalsForBet(
  client: PublicClient,
  betAddress: `0x${string}`,
  fallback = 8,
): Promise<number> {
  const betKey = getAddress(betAddress)
  let feed = betFeedCache.get(betKey)
  if (!feed) {
    try {
      feed = getAddress(
        (await client.readContract({
          address: betKey,
          abi: BetAbi,
          functionName: "priceFeed",
        })) as `0x${string}`,
      )
      betFeedCache.set(betKey, feed)
    } catch {
      return fallback
    }
  }
  return getFeedDecimals(client, feed, fallback)
}
