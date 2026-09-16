/**
 * Deployment registry for all EventMarket contracts across chains.
 *
 * Fill in the `address` and `deployBlock` fields for each deployed contract.
 * The scan-all-event-markets script reads this file to scan every market.
 *
 * `deployBlock` — the block at which the contract was deployed (used as the
 * start block for the very first scan; greatly speeds up cold scans).
 * Leave as 0 if unknown; the scan will start from block 0 (slow).
 */

export type MarketDeployment = {
  /** EventMarket contract address (checksum). Empty string = not deployed yet. */
  address: string
  /** Human-readable description of what the market resolves. */
  question: string
  /** Short label, e.g. "ARG vs FRA". */
  match: string
  /** Team / side that maps to YES outcome. */
  teamA: string
  /** Team / side that maps to NO outcome. */
  teamB: string
  /** FIFA group or stage, e.g. "Group A" / "Round of 16". */
  stage: string
  /** Deploy block — used for the first incremental scan only. */
  deployBlock: number
  /**
   * Lifecycle status. "settled" markets are skipped by scan-all-event-markets
   * (no need to keep scanning blocks once the market is resolved and final).
   * Omit or set "live" while the market is still trading.
   */
  status?: "live" | "settled"
  /**
   * Known final outcome. Set this once the real-world result is in so the
   * settle-event-markets job can resolve the market on-chain. Omit while the
   * market is still live; the job then leaves it untouched.
   */
  resolution?: {
    /** true → YES side (teamA) wins; false → NO side wins. */
    yesWins: boolean
    /** Human-readable reasoning recorded on-chain (e.g. final score). */
    reasoning: string
  }
}

export type ChainDeployment = {
  chainId: number
  slug: string
  label: string
  markets: MarketDeployment[]
}

const deployments: ChainDeployment[] = [
  {
    chainId: 5042002,
    slug: "arc-testnet",
    label: "Arc Testnet",
    markets: [
      // ── US Macro · Fed rate-cut markets (admin-resolved YES/NO) ───────────────
      // Deployed via contracts/script/CreateFedRateMarkets.s.sol (one MEETING per
      // run). Paste the Arc Testnet addresses below — blank is safely skipped
      // until filled. July settled NO on 2026-07-29 (see the Base Sepolia note).
      // {
      //   "address": "0xf0021cd2F7284cd63d7FF147251Ce7732425600c",
      //   "question": "🇺🇸 Will Fed cut rates in July 2026?",
      //   "match": "Fed cut? Jul 2026",
      //   "teamA": "Cut (YES)",
      //   "teamB": "No cut (NO)",
      //   "stage": "US Macro · FOMC Jul 28-29 2026",
      //   "deployBlock": 52759117,
      //   "status": "settled",
      //   "resolution": {
      //     "yesWins": false,
      //     "reasoning": "The FOMC left the target federal funds rate unchanged at its July 28-29, 2026 meeting - no cut, so this market resolves NO."
      //   }
      // },
      {
        "address": "0xCE924ff2DC25bc1c640E9D22c3B4f03a850B99CE",
        "question": "🇺🇸 Will Fed cut rates in September 2026?",
        "match": "Fed cut? Sep 2026",
        "teamA": "Cut (YES)",
        "teamB": "No cut (NO)",
        "stage": "US Macro · FOMC Sep 15-16 2026",
        "deployBlock": 54550834
      },
      // ── Crypto · US digital-asset policy (admin-resolved YES/NO) ──────────────
      // Deployed via contracts/script/CreateCryptoMarkets.s.sol.
      {
        "address": "0x0CD73F8E88f6AfF18FE1a8B2f0dd97A2Fa16c166",
        "question": "🪙 Clarity Act (H.R.3633) signed into law in 2026?",
        "match": "Clarity Act 2026",
        "teamA": "Signed into law (YES)",
        "teamB": "Not signed (NO)",
        "stage": "Crypto · US policy 2026",
        "deployBlock": 54553602
      },
      // ── US Politics · 2026 midterm control markets (admin-resolved YES/NO) ────
      // Deployed via contracts/script/CreateMidtermMarkets.s.sol. Paste the
      // Arc Testnet addresses below — blank is safely skipped until filled.
      {
        "address": "0x29B0f2A2b691C1F5E4E6cC1A32c1E7c7d70A9aaa",
        "question": "🏛️ Will Democrats take the House in 2026?",
        "match": "House · Dems 2026",
        "teamA": "Dems take House (YES)",
        "teamB": "Republicans hold (NO)",
        "stage": "US Midterms 2026",
        "deployBlock": 56882807
      },
      {
        "address": "0x48AD8920DA3840fF2d8E1293ba0CE7e7284e0983",
        "question": "🏛️ Will Republicans hold the Senate in 2026?",
        "match": "Senate · GOP 2026",
        "teamA": "GOP hold Senate (YES)",
        "teamB": "Democrats take (NO)",
        "stage": "US Midterms 2026",
        "deployBlock": 56882811
      }
    ]
  },
  {
    chainId: 84532,
    slug: "base-sepolia",
    label: "Base Sepolia",
    markets: [
      // ── US Macro · Fed rate-cut markets (admin-resolved YES/NO) ───────────────
      // Deployed via contracts/script/CreateFedRateMarkets.s.sol (one MEETING per
      // run). Paste each deployed address below — blank is safely skipped by the
      // fund-and-random ("刷单") worker and the stats scan until it's filled in.
      // Oct/Dec stay webapp-only SOON placeholders until they are deployed nearer
      // their meeting dates.
      //
      // July settled NO on 2026-07-29 (the FOMC held the target range unchanged);
      // see bot/scripts/settle-fed-july-2026.ts. Marked settled so it is skipped
      // by the 刷单 worker and the scan, but kept listed so the portfolio / PnL
      // services still see its positions.
      // {
      //   "address": "0x79f5EE54534dCE6E3232a0300B6d14A733c348b4",
      //   "question": "🇺🇸 Will Fed cut rates in July 2026?",
      //   "match": "Fed cut? Jul 2026",
      //   "teamA": "Cut (YES)",
      //   "teamB": "No cut (NO)",
      //   "stage": "US Macro · FOMC Jul 28-29 2026",
      //   "deployBlock": 44386818,
      //   "status": "settled",
      //   "resolution": {
      //     "yesWins": false,
      //     "reasoning": "The FOMC left the target federal funds rate unchanged at its July 28-29, 2026 meeting - no cut, so this market resolves NO."
      //   }
      // },
      {
        "address": "0x719Ab420384B4658864eEf34b4197df8B9CF8a0f",
        "question": "🇺🇸 Will Fed cut rates in September 2026?",
        "match": "Fed cut? Sep 2026",
        "teamA": "Cut (YES)",
        "teamB": "No cut (NO)",
        "stage": "US Macro · FOMC Sep 15-16 2026",
        "deployBlock": 44855228
      },
      // ── Crypto · US digital-asset policy (admin-resolved YES/NO) ──────────────
      // Deployed via contracts/script/CreateCryptoMarkets.s.sol. Betting runs to
      // the end of 2026, so the 刷单 worker keeps trading it all year.
      {
        "address": "0x00713F4c091400D4FaE15FBA720eCd0A22298E91",
        "question": "🪙 Clarity Act (H.R.3633) signed into law in 2026?",
        "match": "Clarity Act 2026",
        "teamA": "Signed into law (YES)",
        "teamB": "Not signed (NO)",
        "stage": "Crypto · US policy 2026",
        "deployBlock": 44855923
      },
      // ── US Politics · 2026 midterm control markets (admin-resolved YES/NO) ────
      // Deployed via contracts/script/CreateMidtermMarkets.s.sol. Paste the
      // Base Sepolia addresses below — blank is safely skipped until filled.
      {
        "address": "0x16CA2f4609F56bC21C5BF47F53f741D57183f63d",
        "question": "🏛️ Will Democrats take the House in 2026?",
        "match": "House · Dems 2026",
        "teamA": "Dems take House (YES)",
        "teamB": "Republicans hold (NO)",
        "stage": "US Midterms 2026",
        "deployBlock": 45453872
      },
      {
        "address": "0xB29c3b828BC694bD165E4E009911775BD31CC619",
        "question": "🏛️ Will Republicans hold the Senate in 2026?",
        "match": "Senate · GOP 2026",
        "teamA": "GOP hold Senate (YES)",
        "teamB": "Democrats take (NO)",
        "stage": "US Midterms 2026",
        "deployBlock": 45453873
      }
    ],
  },
  {
    chainId: 8453,
    slug: "base",
    label: "Base",
    markets: [],
  }  
]

export default deployments
