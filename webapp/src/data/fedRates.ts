// 2026 FOMC "Will Fed cut rates?" YES/NO markets — data for the Explore page.
//
// One EventMarket per remaining 2026 FOMC meeting. Each resolves ONLY on its own
// meeting: YES = the Fed cuts the target federal funds rate by ANY amount at that
// meeting; NO = held unchanged or hiked. Admin-resolved from the official FOMC
// statement — same contract as the FIFA markets (EventMarket), just a different
// question + schedule.
//
// July has been played out: the FOMC held the target range unchanged on Jul 29,
// so that market settled NO (see bot/scripts/settle-fed-july-2026.ts) and its
// card renders as RESOLVED — still clickable so winners can claim.
//
// September is the meeting now trading. October/December render as SOON
// placeholder cards until they're deployed nearer their date; a card flips to
// LIVE the moment an address is filled in below — mirroring worldCupKnockout.ts.
// Keep the addresses in sync with:
//   - webapp/src/data/eventMarketDeployments.ts (cross-chain /fifa switching)
//   - bot/config/event-market-deployments.ts    (fund-and-random + scan/settle)
//   - bot/src/common/services/champion-pool-probability.ts (odds history chart)
//
// Deploy with contracts/script/CreateFedRateMarkets.s.sol, then paste the logged
// EventMarket address into the matching chain slot below.

// Chains each Fed market is deployed on, in the order shown for filling in.
export const FED_CHAINS = ['base-sepolia', 'arc-testnet'] as const
export type FedChainSlug = (typeof FED_CHAINS)[number]

// Preferred chain to link a card to, once an address exists.
const LINK_CHAIN_PRIORITY: FedChainSlug[] = ['arc-testnet', 'base-sepolia']

export type FedDeployment = {
  chainSlug: FedChainSlug
  /** Deployed EventMarket address on that chain. '' until deployed + filled in. */
  address: `0x${string}` | ''
}

/** Final outcome of a meeting that has already been decided + settled on-chain. */
export type FedResult = {
  /** true → the Fed cut (YES side won); false → held unchanged or hiked (NO won). */
  yesWins: boolean
  /** Short outcome label for the settled card, e.g. "Rates held unchanged". */
  note: string
}

export type FedMarket = {
  /** Stable id shared across chains. */
  id: string
  /** Short month label for the badge/heading, e.g. "July". */
  month: string
  /** YES/NO question rendered on the card. */
  question: string
  /** FOMC meeting dates label, e.g. "Jul 28–29". */
  meetingLabel: string
  /** UTC decision time (unix seconds). Betting closes here; used for the schedule label. */
  decisionUtc: number
  /** Set once the decision is public and the market has settled — card renders RESOLVED. */
  result?: FedResult
  deployments: FedDeployment[]
}

// Fill in a market's per-chain address slots. Chains not yet deployed stay ''.
function deployments(filled: Partial<Record<FedChainSlug, `0x${string}`>>): FedDeployment[] {
  return FED_CHAINS.map((chainSlug) => ({ chainSlug, address: filled[chainSlug] ?? '' }))
}

export const FED_MARKETS: FedMarket[] = [
  {
    id: 'fed-cut-july-2026',
    month: 'July',
    question: '🇺🇸 Will Fed cut rates in July 2026?',
    meetingLabel: 'Jul 28–29',
    decisionUtc: 1785348000, // 2026-07-29 18:00 UTC (2:00pm ET)
    // SETTLED NO — the FOMC held the target range unchanged on Jul 29 2026.
    result: { yesWins: false, note: 'Rates held unchanged' },
    // Deployed July 2026 FOMC pool (marketId 0 on Base Sepolia, 16 on Arc).
    deployments: deployments({
      'base-sepolia': '0x79f5EE54534dCE6E3232a0300B6d14A733c348b4',
      'arc-testnet': '0xf0021cd2F7284cd63d7FF147251Ce7732425600c',
    }),
  },
  {
    id: 'fed-cut-september-2026',
    month: 'September',
    question: '🇺🇸 Will Fed cut rates in September 2026?',
    meetingLabel: 'Sep 15–16',
    decisionUtc: 1789581600, // 2026-09-16 18:00 UTC
    // LIVE — deployed September 2026 FOMC pool (marketId 3 on Base Sepolia, 5 on Arc).
    deployments: deployments({
      'base-sepolia': '0x719Ab420384B4658864eEf34b4197df8B9CF8a0f',
      'arc-testnet': '0xCE924ff2DC25bc1c640E9D22c3B4f03a850B99CE',
    }),
  },
  {
    id: 'fed-cut-october-2026',
    month: 'October',
    question: '🇺🇸 Will Fed cut rates in October 2026?',
    meetingLabel: 'Oct 27–28',
    decisionUtc: 1793210400, // 2026-10-28 18:00 UTC
    deployments: deployments({}),
  },
  {
    id: 'fed-cut-december-2026',
    month: 'December',
    question: '🇺🇸 Will Fed cut rates in December 2026?',
    meetingLabel: 'Dec 8–9',
    decisionUtc: 1796842800, // 2026-12-09 19:00 UTC
    deployments: deployments({}),
  },
]

export type FedMarketLink = { address: `0x${string}`; chainSlug: FedChainSlug }

/** The chain/address a Fed card should link to, or null while unfilled (SOON). */
export function fedLink(m: FedMarket): FedMarketLink | null {
  for (const chainSlug of LINK_CHAIN_PRIORITY) {
    const d = m.deployments.find((x) => x.chainSlug === chainSlug)
    if (d && d.address) return { address: d.address, chainSlug }
  }
  return null
}
