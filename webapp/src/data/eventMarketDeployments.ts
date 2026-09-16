// Cross-chain registry of equivalent EventMarket deployments.
//
// Markets that resolve the SAME real-world question are deployed on multiple
// chains at different addresses. They share one `id` here. The FIFA market page
// uses this so that switching the wallet's network also switches the contract in
// the URL — e.g. the "Germany to win" market on arc-testnet
// (0x4634…) maps to its bsc-testnet twin (0x20E2…).
//
// Keep this in sync with bot/config/event-market-deployments.ts when new
// cross-chain markets are deployed.

import { getChainIdBySlug } from '@/config/chains'

export type EventMarketDeployment = {
  /** Chain slug, matches CHAIN_SLUGS in config/chains.ts (e.g. "arc-testnet"). */
  chainSlug: string
  /** Deployed EventMarket contract address on that chain. */
  address: `0x${string}`
}

export type EventMarketGroup = {
  /** Stable identifier shared by every chain's deployment of this market. */
  id: string
  /** Human-readable question (for reference / debugging). */
  question: string
  /** One entry per chain the market is deployed on. */
  deployments: EventMarketDeployment[]
}

export const EVENT_MARKET_GROUPS: EventMarketGroup[] = [
  // ── Crypto · US digital-asset policy (admin-resolved YES/NO) ─────────────────
  // Source of truth for the /crypto cards is webapp/src/data/cryptoPolicy.ts.
  {
    id: 'clarity-act-2026',
    question: '🪙 Clarity Act (H.R.3633) signed into law in 2026?',
    deployments: [
      { chainSlug: 'base-sepolia', address: '0x00713F4c091400D4FaE15FBA720eCd0A22298E91' },
      { chainSlug: 'arc-testnet', address: '0x0CD73F8E88f6AfF18FE1a8B2f0dd97A2Fa16c166' },
    ],
  },
  // ── US Macro · Fed rate-cut markets (admin-resolved YES/NO) ──────────────────
  // Source of truth for the /fed cards is webapp/src/data/fedRates.ts; these groups
  // let the /fifa page switch the contract when the wallet network changes.
  // Add Oct/Dec groups here when those meetings are deployed.
  {
    // Settled NO — the FOMC held the target range unchanged on Jul 29 2026.
    id: 'fed-cut-july-2026',
    question: '🇺🇸 Will Fed cut rates in July 2026?',
    deployments: [
      { chainSlug: 'base-sepolia', address: '0x79f5EE54534dCE6E3232a0300B6d14A733c348b4' },
      { chainSlug: 'arc-testnet', address: '0xf0021cd2F7284cd63d7FF147251Ce7732425600c' },
    ],
  },
  {
    id: 'fed-cut-september-2026',
    question: '🇺🇸 Will Fed cut rates in September 2026?',
    deployments: [
      { chainSlug: 'base-sepolia', address: '0x719Ab420384B4658864eEf34b4197df8B9CF8a0f' },
      { chainSlug: 'arc-testnet', address: '0xCE924ff2DC25bc1c640E9D22c3B4f03a850B99CE' },
    ],
  },
  // ── US Politics · 2026 midterm control markets ───────────────────────────────
  // Source of truth for the /midterm cards is webapp/src/data/midterm.ts; these
  // groups let the /fifa page switch the contract on network change.
  {
    id: 'midterm-house-dems-2026',
    question: '🏛️ Will Democrats take the House in 2026?',
    deployments: [
      { chainSlug: 'base-sepolia', address: '0x16CA2f4609F56bC21C5BF47F53f741D57183f63d' },
      { chainSlug: 'arc-testnet', address: '0x29B0f2A2b691C1F5E4E6cC1A32c1E7c7d70A9aaa' },
    ],
  },
  {
    id: 'midterm-senate-reps-2026',
    question: '🏛️ Will Republicans hold the Senate in 2026?',
    deployments: [
      { chainSlug: 'base-sepolia', address: '0xB29c3b828BC694bD165E4E009911775BD31CC619' },
      { chainSlug: 'arc-testnet', address: '0x48AD8920DA3840fF2d8E1293ba0CE7e7284e0983' },
    ],
  },
]

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/** Find the cross-chain group a given EventMarket address belongs to. */
export function findEventMarketGroup(address?: string | null): EventMarketGroup | undefined {
  if (!address) return undefined
  return EVENT_MARKET_GROUPS.find((g) =>
    g.deployments.some((d) => sameAddress(d.address, address)),
  )
}

/** Resolve a group's deployment on a specific chain (by chainId). */
export function eventMarketAddressOnChain(
  group: EventMarketGroup,
  chainId: number,
): `0x${string}` | undefined {
  return group.deployments.find((d) => getChainIdBySlug(d.chainSlug) === chainId)?.address
}
