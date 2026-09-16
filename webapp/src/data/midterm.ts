// 2026 US midterm elections — YES/NO markets for the /midterm page.
//
// Two admin-resolved EventMarkets (same contract as the FIFA / Fed markets):
//   • House  — YES = the Democratic Party wins control of the U.S. House.
//   • Senate — YES = the Republican Party retains control of the U.S. Senate.
// Both are live from deploy (no SOON placeholder). A card flips to LIVE the
// moment an address is filled in below — mirroring fedRates.ts. Keep addresses
// in sync with:
//   - webapp/src/data/eventMarketDeployments.ts (cross-chain /fifa switching)
//   - bot/config/event-market-deployments.ts    (fund-and-random + scan/settle)
//
// Deploy with contracts/script/CreateMidtermMarkets.s.sol, then paste each
// logged EventMarket address into the matching chain slot below.

// Chains each midterm market is deployed on, in the order shown for filling in.
export const MIDTERM_CHAINS = ['base-sepolia', 'arc-testnet'] as const
export type MidtermChainSlug = (typeof MIDTERM_CHAINS)[number]

// Preferred chain to link a card to, once an address exists.
const LINK_CHAIN_PRIORITY: MidtermChainSlug[] = ['arc-testnet', 'base-sepolia']

export type MidtermDeployment = {
  chainSlug: MidtermChainSlug
  /** Deployed EventMarket address on that chain. '' until deployed + filled in. */
  address: `0x${string}` | ''
}

export type MidtermMarket = {
  /** Stable id shared across chains. */
  id: string
  /** Chamber label for the badge, e.g. "House" / "Senate". */
  chamber: string
  /** YES/NO question rendered on the card. */
  question: string
  /** UTC betting close (election night). Shown as the schedule label. */
  closesUtc: number
  deployments: MidtermDeployment[]
}

// Fill in a market's per-chain address slots. Chains not yet deployed stay ''.
function deployments(filled: Partial<Record<MidtermChainSlug, `0x${string}`>>): MidtermDeployment[] {
  return MIDTERM_CHAINS.map((chainSlug) => ({ chainSlug, address: filled[chainSlug] ?? '' }))
}

export const MIDTERM_MARKETS: MidtermMarket[] = [
  {
    id: 'midterm-house-dems-2026',
    chamber: 'House',
    question: '🏛️ Will Democrats take the House in 2026?',
    closesUtc: 1793772000, // 2026-11-04 06:00 UTC (election night)
    // LIVE — deployed 2026 House control market (marketId 1 Base Sepolia, 17 Arc).
    deployments: deployments({
      'base-sepolia': '0x16CA2f4609F56bC21C5BF47F53f741D57183f63d',
      'arc-testnet': '0x29B0f2A2b691C1F5E4E6cC1A32c1E7c7d70A9aaa',
    }),
  },
  {
    id: 'midterm-senate-reps-2026',
    chamber: 'Senate',
    question: '🏛️ Will Republicans hold the Senate in 2026?',
    closesUtc: 1793772000, // 2026-11-04 06:00 UTC (election night)
    // LIVE — deployed 2026 Senate control market (marketId 2 Base Sepolia, 18 Arc).
    deployments: deployments({
      'base-sepolia': '0xB29c3b828BC694bD165E4E009911775BD31CC619',
      'arc-testnet': '0x48AD8920DA3840fF2d8E1293ba0CE7e7284e0983',
    }),
  },
]

export type MidtermMarketLink = { address: `0x${string}`; chainSlug: MidtermChainSlug }

/** The chain/address a midterm card should link to, or null while unfilled. */
export function midtermLink(m: MidtermMarket): MidtermMarketLink | null {
  for (const chainSlug of LINK_CHAIN_PRIORITY) {
    const d = m.deployments.find((x) => x.chainSlug === chainSlug)
    if (d && d.address) return { address: d.address, chainSlug }
  }
  return null
}
