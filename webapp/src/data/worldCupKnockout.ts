// 2026 FIFA World Cup knockout stage — data for the Explore page.
//
//  • CHAMPION_MARKETS — the "tournament winner" YES/NO markets for the eight
//    quarter-finalists. Each is deployed on all three chains (base-sepolia,
//    arc-testnet, bsc-testnet) by contracts/script/CreateChampionshipMarkets.s.sol.
//    Run that script once per chain, then paste the logged addresses into the
//    matching `address` slot below (they start blank).
//
//  • QUARTER_FINALS — the eight-team knockout bracket shown as preview cards.
//    These are display-only mocks (no on-chain market yet).
//
// After filling addresses here, mirror them into eventMarketDeployments.ts (for
// the FIFA page's cross-chain switching) and bot/config/event-market-deployments.ts.

// Chains each champion market is deployed on, in the order shown for filling in.
export const CHAMPION_CHAINS = ['base-sepolia', 'arc-testnet', 'bsc-testnet'] as const
export type ChampionChainSlug = (typeof CHAMPION_CHAINS)[number]

// Preferred chain to link the Explore card to, once an address exists.
const LINK_CHAIN_PRIORITY: ChampionChainSlug[] = ['arc-testnet', 'base-sepolia', 'bsc-testnet']

export type ChampionDeployment = {
  chainSlug: ChampionChainSlug
  /** Deployed EventMarket address on that chain. '' until deployed + filled in. */
  address: `0x${string}` | ''
}

export type ChampionMarket = {
  /** Stable id shared across chains (matches eventMarketDeployments.ts convention). */
  id: string
  team: string
  flag: string
  question: string
  /** True once the team is knocked out — it can no longer win the tournament. */
  eliminated?: boolean
  /** True for the team that won the tournament (its YES market settled YES). */
  champion?: boolean
  deployments: ChampionDeployment[]
}

// Fill in a champion's per-chain address slots. Chains not yet deployed stay ''.
function deployments(filled: Partial<Record<ChampionChainSlug, `0x${string}`>>): ChampionDeployment[] {
  return CHAMPION_CHAINS.map((chainSlug) => ({ chainSlug, address: filled[chainSlug] ?? '' }))
}

export const CHAMPION_MARKETS: ChampionMarket[] = [
  { id: 'france-champion-2026', team: 'France', flag: '🇫🇷', question: '🇫🇷 France to win World Cup 2026?', eliminated: true, deployments: deployments({ 'base-sepolia': '0x8a25E1998e8482f5Fc59CC1ac1307ab7B96EDCA6', 'arc-testnet': '0xf3E37DF749Dafee17fB9556AEB2aa236998c54A6', 'bsc-testnet': '0xEE74fb96Bc55a693E0A432f4991b85FDAA85f177' }) },
  { id: 'morocco-champion-2026', team: 'Morocco', flag: '🇲🇦', question: '🇲🇦 Morocco to win World Cup 2026?', eliminated: true, deployments: deployments({ 'base-sepolia': '0xcD387D85c64Cb0f240a86b2Bd1b2fE1512eb6918', 'arc-testnet': '0xB1861b6c28c60C3E26ad467b2C6F2d8a8581bC7c', 'bsc-testnet': '0x2cC038bb25044c1DAD7837E16bd68da8ae66907C' }) },
  { id: 'spain-champion-2026', team: 'Spain', flag: '🇪🇸', question: '🇪🇸 Spain to win World Cup 2026?', champion: true, deployments: deployments({ 'base-sepolia': '0x3E2e0a5Ef0A7DE4737728Bc68A85f3B19fd9039F', 'arc-testnet': '0x3E850A4E97fa07Af520fceCd3EeE32a35653FbE6', 'bsc-testnet': '0x20E4ddAE55cF66965497c75c69Dd8640eC13662F' }) },
  { id: 'belgium-champion-2026', team: 'Belgium', flag: '🇧🇪', question: '🇧🇪 Belgium to win World Cup 2026?', eliminated: true, deployments: deployments({ 'base-sepolia': '0x745AFF87044FaC70eFe3339dE1ee21b4C156e83a', 'arc-testnet': '0x33Ed2909E5348C8d3b99aF34468E7F2FdA65Dabf', 'bsc-testnet': '0x400fe73d28d1a9D599534a2Ca4F5E57Aed3B4766' }) },
  { id: 'norway-champion-2026', team: 'Norway', flag: '🇳🇴', question: '🇳🇴 Norway to win World Cup 2026?', eliminated: true, deployments: deployments({ 'base-sepolia': '0x71e4246085c2b970Ca4394d155D319C558181Ef4', 'arc-testnet': '0x82fc0b6D7fBe311DADc33679cF44a48c426c75a7', 'bsc-testnet': '0x06b6cee271f34590610Ae25c6cAb0F59B691f3A7' }) },
  { id: 'england-champion-2026', team: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', question: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 England to win World Cup 2026?', eliminated: true, deployments: deployments({ 'base-sepolia': '0xDde95537bEE2d4A91b49FD13890A2D79a831Fcf6', 'arc-testnet': '0xF930DEB8Cf5157777F42558D6e5AE92D822E93dB', 'bsc-testnet': '0x66fA699546401806ABFb44FFF8FB78576915eA0A' }) },
  { id: 'argentina-champion-2026', team: 'Argentina', flag: '🇦🇷', question: '🇦🇷 Argentina to win World Cup 2026?', eliminated: true, deployments: deployments({ 'base-sepolia': '0xE8516Aa08B73A79c55a606181A333fBA70Da3025', 'arc-testnet': '0xebafd4FE822021AE42BbEE06E45846c3702069e7', 'bsc-testnet': '0xcFf02a3cfcE2375f69f4c13d4020DFaBF0b1a713' }) },
  { id: 'switzerland-champion-2026', team: 'Switzerland', flag: '🇨🇭', question: '🇨🇭 Switzerland to win World Cup 2026?', eliminated: true, deployments: deployments({ 'base-sepolia': '0xE40D99EAd9c59c1Ac5Eb7794859b1F23e56aa8A6', 'arc-testnet': '0x9e7F12A60c33446E547b139F8A413F1D81B86C42', 'bsc-testnet': '0x970e78a3A188DC5Cf468C6249c3f273eFB462Bc1' }) },
]

type MarketLink = { address: `0x${string}`; chainSlug: ChampionChainSlug }

/** The chain/address an Explore card should link to, or null while unfilled. */
function pickLink(deps: ChampionDeployment[]): MarketLink | null {
  for (const chainSlug of LINK_CHAIN_PRIORITY) {
    const d = deps.find((x) => x.chainSlug === chainSlug)
    if (d && d.address) return { address: d.address, chainSlug }
  }
  return null
}

export function championLink(m: ChampionMarket): MarketLink | null {
  return pickLink(m.deployments)
}

// ── Quarter-finals ───────────────────────────────────────────────────────────
// One YES/NO market per matchup, YES = the home team wins the tie. Deployed on
// all three chains by contracts/script/CreateQuarterFinalMarkets.s.sol; paste the
// logged addresses into the matching slot below. Cards preview as SOON until then.
export type KoTeam = { name: string; flag: string }
/** Final result of a played tie. `winner` says which side advanced. */
export type QuarterFinalResult = { winner: 'home' | 'away'; homeScore: number; awayScore: number }
export type QuarterFinal = {
  slug: string
  home: KoTeam
  away: KoTeam
  venue: string
  /** UTC kickoff (seconds). Used only for the schedule label. */
  kickoffUtc: number
  /** Round label for preview cards, e.g. "Semi-final" / "Final". Defaults to a generic tag. */
  roundLabel?: string
  /** Set once the tie has been played — the card then renders as settled (FULL TIME). */
  result?: QuarterFinalResult
  /** Per-chain EventMarket addresses (YES = home wins). '' until deployed. */
  deployments: ChampionDeployment[]
}

/** A knockout tie of any round — quarter-final, semi-final, final. Same shape. */
export type KnockoutTie = QuarterFinal

export function quarterFinalLink(m: KnockoutTie): MarketLink | null {
  return pickLink(m.deployments)
}

export function semiFinalLink(m: KnockoutTie): MarketLink | null {
  return pickLink(m.deployments)
}

export function finalLink(m: KnockoutTie): MarketLink | null {
  return pickLink(m.deployments)
}

// All four quarter-finals have been played — cards render as settled (FULL TIME),
// ordered chronologically by kickoff.
export const QUARTER_FINALS: KnockoutTie[] = [
  { slug: 'france-morocco', home: { name: 'France', flag: '🇫🇷' }, away: { name: 'Morocco', flag: '🇲🇦' }, venue: 'Boston Stadium (Boston)', kickoffUtc: 1783656000, result: { winner: 'home', homeScore: 2, awayScore: 0 }, deployments: deployments({ 'base-sepolia': '0x5D8F2286233Eb1007273b2F2B5a2079392AAe8C8', 'arc-testnet': '0x054dEe729F89de32E4150244f1B0268ceAeED8e2', 'bsc-testnet': '0x895B41471b70e450CE6319082e40EA5c118b0438' }) },
  { slug: 'spain-belgium', home: { name: 'Spain', flag: '🇪🇸' }, away: { name: 'Belgium', flag: '🇧🇪' }, venue: 'Los Angeles Stadium (Los Angeles)', kickoffUtc: 1783738800, result: { winner: 'home', homeScore: 2, awayScore: 1 }, deployments: deployments({ 'base-sepolia': '0x9DbfBa1cf143A0cD33fC5059b995A808c3A732A9', 'arc-testnet': '0x260dEae0dbEfb7D220887D087891fE5cF7a1d4a4', 'bsc-testnet': '0x864e488AF61D2fEE85465Aa6C7b7dbF5978C4D7F' }) },
  { slug: 'norway-england', home: { name: 'Norway', flag: '🇳🇴' }, away: { name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' }, venue: 'Miami Stadium (Miami)', kickoffUtc: 1783832400, result: { winner: 'away', homeScore: 1, awayScore: 2 }, deployments: deployments({ 'base-sepolia': '0xAD11FaEE1bc796b9f2eFBbfa534855B0ad915f02', 'arc-testnet': '0x727c36c3b4dc15AFdEd68b8f171Ca79E548E781d', 'bsc-testnet': '0x842bf3DF3744144a648CFe2c386Ec55DD89BAa97' }) },
  { slug: 'argentina-switzerland', home: { name: 'Argentina', flag: '🇦🇷' }, away: { name: 'Switzerland', flag: '🇨🇭' }, venue: 'Kansas City Stadium (Kansas City)', kickoffUtc: 1783846800, result: { winner: 'home', homeScore: 3, awayScore: 1 }, deployments: deployments({ 'base-sepolia': '0x42d6F88f0De369bcDD27E482b923998Ced3a11F6', 'arc-testnet': '0x56EDCA2E1878B3eE0097bF2d8F7B818861D5cf68', 'bsc-testnet': '0x4f396014C1971074eDBFeF479aa7B07ce6eD9e57' }) },
]

// ── Semi-finals ──────────────────────────────────────────────────────────────
// One YES/NO market per matchup, YES = the home team wins the tie. Deployed on
// all three chains by contracts/script/CreateSemiFinalMarkets.s.sol; paste the
// logged addresses into the matching slot below. Cards preview as SOON until then.
// After filling, mirror into eventMarketDeployments.ts and
// bot/config/event-market-deployments.ts.
export const SEMI_FINALS: KnockoutTie[] = [
  { slug: 'france-spain', home: { name: 'France', flag: '🇫🇷' }, away: { name: 'Spain', flag: '🇪🇸' }, venue: 'Dallas Stadium (Dallas)', kickoffUtc: 1784062800, result: { winner: 'away', homeScore: 0, awayScore: 2 }, deployments: deployments({ 'arc-testnet': '0xc2C01Ba592F417a51f780C9F5f1fb3527483aFa3', 'base-sepolia': '0x3F1632748cE2D92a9C426BDFc14b045a69b1Ec48' }) },
  { slug: 'england-argentina', home: { name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' }, away: { name: 'Argentina', flag: '🇦🇷' }, venue: 'Atlanta Stadium (Atlanta)', kickoffUtc: 1784149200, result: { winner: 'away', homeScore: 1, awayScore: 2 }, deployments: deployments({ 'arc-testnet': '0xe2609614BcC73fA1b67d4448c09643b756688A47', 'base-sepolia': '0x57E173108B15937a9FAD347a10af7bB28F48782d' }) },
]

// ── Final & third-place play-off ──────────────────────────────────────────────
// The two closing matchup markets, YES = the home team wins the tie. Deployed by
// contracts/script/CreateFinalMarkets.s.sol; paste the logged addresses into the
// matching slot below (they start blank → cards preview as SOON). After filling,
// mirror into eventMarketDeployments.ts and bot/config/event-market-deployments.ts.
// The final (Spain vs Argentina) is listed first as the marquee card.
export const FINALS: KnockoutTie[] = [
  { slug: 'spain-argentina', roundLabel: 'Final', home: { name: 'Spain', flag: '🇪🇸' }, away: { name: 'Argentina', flag: '🇦🇷' }, venue: 'New York/New Jersey Stadium (New Jersey)', kickoffUtc: 1784516400, result: { winner: 'home', homeScore: 1, awayScore: 0 }, deployments: deployments({ 'base-sepolia': '0x7bE6F30362F6e7FfA451E7f5f24DB947d36340F6', 'arc-testnet': '0xa743cE5d54fAD5D33E793c0646431CC4D0F6e178' }) },
  { slug: 'france-england', roundLabel: 'Third place', home: { name: 'France', flag: '🇫🇷' }, away: { name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' }, venue: 'Miami Stadium (Miami)', kickoffUtc: 1784437200, result: { winner: 'away', homeScore: 4, awayScore: 6 }, deployments: deployments({ 'base-sepolia': '0x8d0D9a67C65ab1dd35659ed2AaF9291499689418', 'arc-testnet': '0x0ad8Ab0417292170171fb7b37fEC205859ee5FC8' }) },
]
