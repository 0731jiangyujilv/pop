// Crypto-policy YES/NO markets for the /crypto page.
//
// One admin-resolved EventMarket for now (same contract as the Fed / midterm
// markets): will the CLARITY Act (H.R.3633) be enacted before 2027. Modelled on
// polymarket.com/event/clarity-act-signed-into-law-in-2026, which closes at the
// same instant (2027-01-01 05:00 UTC = Dec 31 2026 midnight ET).
//
// Live from deploy — no SOON placeholder; a card flips to LIVE the moment an
// address is filled in below, mirroring midterm.ts. Keep addresses in sync with:
//   - webapp/src/data/eventMarketDeployments.ts (cross-chain /fifa switching)
//   - bot/config/event-market-deployments.ts    (fund-and-random + scan/settle)
//   - bot/src/common/services/champion-pool-probability.ts (odds history chart)
//
// Deploy with contracts/script/CreateCryptoMarkets.s.sol, then paste each logged
// EventMarket address into the matching chain slot below.

// Chains each crypto market is deployed on, in the order shown for filling in.
export const CRYPTO_CHAINS = ['base-sepolia', 'arc-testnet'] as const
export type CryptoChainSlug = (typeof CRYPTO_CHAINS)[number]

// Preferred chain to link a card to, once an address exists.
const LINK_CHAIN_PRIORITY: CryptoChainSlug[] = ['arc-testnet', 'base-sepolia']

export type CryptoDeployment = {
  chainSlug: CryptoChainSlug
  /** Deployed EventMarket address on that chain. '' until deployed + filled in. */
  address: `0x${string}` | ''
}

export type CryptoMarket = {
  /** Stable id shared across chains (also the chart's color/series key). */
  id: string
  /** Short topic label for the badge, e.g. "Market structure". */
  topic: string
  /** YES/NO question rendered on the card. */
  question: string
  /** UTC betting close (unix seconds). Shown as the schedule label. */
  closesUtc: number
  /** One-line plain-English summary under the question. */
  blurb: string
  deployments: CryptoDeployment[]
}

// Fill in a market's per-chain address slots. Chains not yet deployed stay ''.
function deployments(filled: Partial<Record<CryptoChainSlug, `0x${string}`>>): CryptoDeployment[] {
  return CRYPTO_CHAINS.map((chainSlug) => ({ chainSlug, address: filled[chainSlug] ?? '' }))
}

export const CRYPTO_MARKETS: CryptoMarket[] = [
  {
    id: 'clarity-act-2026',
    topic: 'Market structure',
    question: '🪙 Clarity Act (H.R.3633) signed into law in 2026?',
    closesUtc: 1798779600, // 2027-01-01 05:00 UTC (Dec 31 2026 24:00 ET)
    blurb:
      '',
    // LIVE — deployed Clarity Act market (marketId 4 on Base Sepolia, 6 on Arc).
    deployments: deployments({
      'base-sepolia': '0x00713F4c091400D4FaE15FBA720eCd0A22298E91',
      'arc-testnet': '0x0CD73F8E88f6AfF18FE1a8B2f0dd97A2Fa16c166',
    }),
  },
]

export type CryptoMarketLink = { address: `0x${string}`; chainSlug: CryptoChainSlug }

/** The chain/address a crypto card should link to, or null while unfilled. */
export function cryptoLink(m: CryptoMarket): CryptoMarketLink | null {
  for (const chainSlug of LINK_CHAIN_PRIORITY) {
    const d = m.deployments.find((x) => x.chainSlug === chainSlug)
    if (d && d.address) return { address: d.address, chainSlug }
  }
  return null
}
