// AUTO-GENERATED schedule data for the 2026 FIFA World Cup group stage.
// 72 fixtures (groups A-L). Kickoff times are real (Beijing-time schedule
// converted to UTC). Matches with a `result` have already been played and are
// rendered as static settled result pages; the rest are live on-chain markets
// (fill WC_MARKET_ADDRESSES once CreateWorldCupMarkets.s.sol has been deployed).

export type WcTeam = { name: string; flag: string }
export type WcResult = { homeScore: number; awayScore: number; yesWins: boolean; isDraw: boolean }
export type WcMatch = {
  no: number
  group: string
  slug: string
  home: WcTeam
  away: WcTeam
  venue: string
  kickoffUtc: number
  result?: WcResult
  // Deployed EventMarket address for this fixture. When set, the fixture links to
  // the live on-chain market page (/fifa/:contract) instead of the static result
  // page — even if a `result` is present. `chain` overrides WC_CHAIN_SLUG per-match.
  contract?: `0x${string}`
  chain?: string
}

// Chain the on-chain markets are deployed on (matches CHAIN_SLUGS in config/chains).
export const WC_CHAIN_SLUG = 'arc-testnet'

// marketId/no -> deployed EventMarket address. Filled in after the deploy script
// runs (the script logs `match i -> address`). Decided matches (with a `result`)
// are static pages and intentionally have NO entry here.
export const WC_MARKET_ADDRESSES: Record<number, `0x${string}`> = {
  // 3: '0x...',
  // 4: '0x...',
}

export const WC_MATCHES: WcMatch[] = [
  // ── Matchday 3 (not yet played) — open markets, no result ───────────────────
  { no: 1, group: "A", slug: "mexico-south-africa", home: { name: "Mexico", flag: "🇲🇽" }, away: { name: "South Africa", flag: "🇿🇦" }, venue: "Mexico City", kickoffUtc: 1781204400 },
  { no: 2, group: "A", slug: "south-korea-czechia", home: { name: "South Korea", flag: "🇰🇷" }, away: { name: "Czechia", flag: "🇨🇿" }, venue: "Guadalajara", kickoffUtc: 1781229600 },
  { no: 3, group: "B", slug: "canada-bosnia-and-herzegovina", home: { name: "Canada", flag: "🇨🇦" }, away: { name: "Bosnia and Herzegovina", flag: "🇧🇦" }, venue: "Toronto", kickoffUtc: 1781290800 },
  { no: 4, group: "D", slug: "usa-paraguay", home: { name: "USA", flag: "🇺🇸" }, away: { name: "Paraguay", flag: "🇵🇾" }, venue: "Los Angeles", kickoffUtc: 1781312400 },
  { no: 5, group: "C", slug: "haiti-scotland", home: { name: "Haiti", flag: "🇭🇹" }, away: { name: "Scotland", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" }, venue: "Boston", kickoffUtc: 1781398800 },
  { no: 6, group: "D", slug: "australia-turkey", home: { name: "Australia", flag: "🇦🇺" }, away: { name: "Turkey", flag: "🇹🇷" }, venue: "Vancouver", kickoffUtc: 1781409600 },
  { no: 7, group: "C", slug: "brazil-morocco", home: { name: "Brazil", flag: "🇧🇷" }, away: { name: "Morocco", flag: "🇲🇦" }, venue: "New York / New Jersey", kickoffUtc: 1781388000 },
  { no: 8, group: "B", slug: "qatar-switzerland", home: { name: "Qatar", flag: "🇶🇦" }, away: { name: "Switzerland", flag: "🇨🇭" }, venue: "San Francisco", kickoffUtc: 1781377200 },
  { no: 9, group: "E", slug: "cote-d-ivoire-ecuador", home: { name: "Cote d'Ivoire", flag: "🇨🇮" }, away: { name: "Ecuador", flag: "🇪🇨" }, venue: "Philadelphia", kickoffUtc: 1781478000 },
  { no: 10, group: "E", slug: "germany-curacao", home: { name: "Germany", flag: "🇩🇪" }, away: { name: "Curacao", flag: "🇨🇼" }, venue: "Houston", kickoffUtc: 1781456400 },
  { no: 11, group: "F", slug: "netherlands-japan", home: { name: "Netherlands", flag: "🇳🇱" }, away: { name: "Japan", flag: "🇯🇵" }, venue: "Dallas", kickoffUtc: 1781467200 },
  { no: 12, group: "F", slug: "sweden-tunisia", home: { name: "Sweden", flag: "🇸🇪" }, away: { name: "Tunisia", flag: "🇹🇳" }, venue: "Monterrey", kickoffUtc: 1781488800 },
  { no: 13, group: "H", slug: "saudi-arabia-uruguay", home: { name: "Saudi Arabia", flag: "🇸🇦" }, away: { name: "Uruguay", flag: "🇺🇾" }, venue: "Miami", kickoffUtc: 1781560800 },
  { no: 14, group: "H", slug: "spain-cape-verde", home: { name: "Spain", flag: "🇪🇸" }, away: { name: "Cape Verde", flag: "🇨🇻" }, venue: "Atlanta", kickoffUtc: 1781539200 },
  { no: 15, group: "G", slug: "iran-new-zealand", home: { name: "Iran", flag: "🇮🇷" }, away: { name: "New Zealand", flag: "🇳🇿" }, venue: "Los Angeles", kickoffUtc: 1781571600 },
  { no: 16, group: "G", slug: "belgium-egypt", home: { name: "Belgium", flag: "🇧🇪" }, away: { name: "Egypt", flag: "🇪🇬" }, venue: "Seattle", kickoffUtc: 1781550000 },
  { no: 17, group: "I", slug: "france-senegal", home: { name: "France", flag: "🇫🇷" }, away: { name: "Senegal", flag: "🇸🇳" }, venue: "New York / New Jersey", kickoffUtc: 1781636400 },
  { no: 18, group: "I", slug: "iraq-norway", home: { name: "Iraq", flag: "🇮🇶" }, away: { name: "Norway", flag: "🇳🇴" }, venue: "Boston", kickoffUtc: 1781647200 },
  { no: 19, group: "J", slug: "argentina-algeria", home: { name: "Argentina", flag: "🇦🇷" }, away: { name: "Algeria", flag: "🇩🇿" }, venue: "Kansas City", kickoffUtc: 1781658000 },
  { no: 20, group: "J", slug: "austria-jordan", home: { name: "Austria", flag: "🇦🇹" }, away: { name: "Jordan", flag: "🇯🇴" }, venue: "San Francisco", kickoffUtc: 1781668800 },
  { no: 21, group: "L", slug: "ghana-panama", home: { name: "Ghana", flag: "🇬🇭" }, away: { name: "Panama", flag: "🇵🇦" }, venue: "Toronto", kickoffUtc: 1781737200 },
  { no: 22, group: "L", slug: "england-croatia", home: { name: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" }, away: { name: "Croatia", flag: "🇭🇷" }, venue: "Dallas", kickoffUtc: 1781726400 },
  { no: 23, group: "K", slug: "portugal-dr-congo", home: { name: "Portugal", flag: "🇵🇹" }, away: { name: "DR Congo", flag: "🇨🇩" }, venue: "Houston", kickoffUtc: 1781715600 },
  // ── Played matches — full-time results ──────────────────────────────────────
  { no: 24, group: "K", slug: "uzbekistan-colombia", home: { name: "Uzbekistan", flag: "🇺🇿" }, away: { name: "Colombia", flag: "🇨🇴" }, venue: "Mexico City", kickoffUtc: 1781748000, result: { homeScore: 1, awayScore: 3, yesWins: false, isDraw: false } },
  { no: 25, group: "A", slug: "czechia-south-africa", home: { name: "Czechia", flag: "🇨🇿" }, away: { name: "South Africa", flag: "🇿🇦" }, venue: "Atlanta", kickoffUtc: 1781798400, result: { homeScore: 1, awayScore: 1, yesWins: false, isDraw: true } },
  { no: 26, group: "B", slug: "switzerland-bosnia-and-herzegovina", home: { name: "Switzerland", flag: "🇨🇭" }, away: { name: "Bosnia and Herzegovina", flag: "🇧🇦" }, venue: "Los Angeles", kickoffUtc: 1781809200, result: { homeScore: 4, awayScore: 1, yesWins: true, isDraw: false } },
  { no: 27, group: "B", slug: "canada-qatar", home: { name: "Canada", flag: "🇨🇦" }, away: { name: "Qatar", flag: "🇶🇦" }, venue: "Vancouver", kickoffUtc: 1781820000, result: { homeScore: 6, awayScore: 0, yesWins: true, isDraw: false } },
  { no: 28, group: "A", slug: "mexico-south-korea", home: { name: "Mexico", flag: "🇲🇽" }, away: { name: "South Korea", flag: "🇰🇷" }, venue: "Guadalajara", kickoffUtc: 1781830800, result: { homeScore: 1, awayScore: 0, yesWins: true, isDraw: false } },
  { no: 29, group: "C", slug: "brazil-haiti", home: { name: "Brazil", flag: "🇧🇷" }, away: { name: "Haiti", flag: "🇭🇹" }, venue: "Philadelphia", kickoffUtc: 1781915400, result: { homeScore: 3, awayScore: 0, yesWins: true, isDraw: false } },
  { no: 30, group: "C", slug: "scotland-morocco", home: { name: "Scotland", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" }, away: { name: "Morocco", flag: "🇲🇦" }, venue: "Boston", kickoffUtc: 1781906400, result: { homeScore: 0, awayScore: 1, yesWins: false, isDraw: false } },
  { no: 31, group: "D", slug: "turkey-paraguay", home: { name: "Turkey", flag: "🇹🇷" }, away: { name: "Paraguay", flag: "🇵🇾" }, venue: "San Francisco", kickoffUtc: 1781924400, result: { homeScore: 0, awayScore: 1, yesWins: false, isDraw: false } },
  { no: 32, group: "D", slug: "usa-australia", home: { name: "USA", flag: "🇺🇸" }, away: { name: "Australia", flag: "🇦🇺" }, venue: "Seattle", kickoffUtc: 1781895600, result: { homeScore: 2, awayScore: 0, yesWins: true, isDraw: false } },
  { no: 33, group: "E", slug: "germany-cote-d-ivoire", home: { name: "Germany", flag: "🇩🇪" }, away: { name: "Cote d'Ivoire", flag: "🇨🇮" }, venue: "Toronto", kickoffUtc: 1781985600, result: { homeScore: 2, awayScore: 1, yesWins: true, isDraw: false } },
  { no: 34, group: "E", slug: "ecuador-curacao", home: { name: "Ecuador", flag: "🇪🇨" }, away: { name: "Curacao", flag: "🇨🇼" }, venue: "Kansas City", kickoffUtc: 1782000000, result: { homeScore: 0, awayScore: 0, yesWins: false, isDraw: true } },
  { no: 35, group: "F", slug: "netherlands-sweden", home: { name: "Netherlands", flag: "🇳🇱" }, away: { name: "Sweden", flag: "🇸🇪" }, venue: "Houston", kickoffUtc: 1781974800, result: { homeScore: 5, awayScore: 1, yesWins: true, isDraw: false } },
  { no: 36, group: "F", slug: "tunisia-japan", home: { name: "Tunisia", flag: "🇹🇳" }, away: { name: "Japan", flag: "🇯🇵" }, venue: "Monterrey", kickoffUtc: 1782014400, result: { homeScore: 0, awayScore: 4, yesWins: false, isDraw: false } },
  { no: 37, group: "H", slug: "uruguay-cape-verde", home: { name: "Uruguay", flag: "🇺🇾" }, away: { name: "Cape Verde", flag: "🇨🇻" }, venue: "Miami", kickoffUtc: 1782079200, result: { homeScore: 2, awayScore: 2, yesWins: false, isDraw: true } },
  { no: 38, group: "H", slug: "spain-saudi-arabia", home: { name: "Spain", flag: "🇪🇸" }, away: { name: "Saudi Arabia", flag: "🇸🇦" }, venue: "Atlanta", kickoffUtc: 1782057600, result: { homeScore: 4, awayScore: 0, yesWins: true, isDraw: false } },
  { no: 39, group: "G", slug: "belgium-iran", home: { name: "Belgium", flag: "🇧🇪" }, away: { name: "Iran", flag: "🇮🇷" }, venue: "Los Angeles", kickoffUtc: 1782068400, result: { homeScore: 0, awayScore: 0, yesWins: false, isDraw: true } },
  { no: 40, group: "G", slug: "new-zealand-egypt", home: { name: "New Zealand", flag: "🇳🇿" }, away: { name: "Egypt", flag: "🇪🇬" }, venue: "Vancouver", kickoffUtc: 1782090000, result: { homeScore: 1, awayScore: 3, yesWins: false, isDraw: false } },
  { no: 41, group: "I", slug: "norway-senegal", home: { name: "Norway", flag: "🇳🇴" }, away: { name: "Senegal", flag: "🇸🇳" }, venue: "New York / New Jersey", kickoffUtc: 1782172800, result: { homeScore: 3, awayScore: 2, yesWins: true, isDraw: false } },
  { no: 42, group: "I", slug: "france-iraq", home: { name: "France", flag: "🇫🇷" }, away: { name: "Iraq", flag: "🇮🇶" }, venue: "Philadelphia", kickoffUtc: 1782162000, result: { homeScore: 3, awayScore: 0, yesWins: true, isDraw: false } },
  { no: 43, group: "J", slug: "argentina-austria", home: { name: "Argentina", flag: "🇦🇷" }, away: { name: "Austria", flag: "🇦🇹" }, venue: "Dallas", kickoffUtc: 1782147600, result: { homeScore: 2, awayScore: 0, yesWins: true, isDraw: false } },
  { no: 44, group: "J", slug: "jordan-algeria", home: { name: "Jordan", flag: "🇯🇴" }, away: { name: "Algeria", flag: "🇩🇿" }, venue: "San Francisco", kickoffUtc: 1782183600, result: { homeScore: 1, awayScore: 2, yesWins: false, isDraw: false } },
  { no: 45, group: "L", slug: "england-ghana", home: { name: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" }, away: { name: "Ghana", flag: "🇬🇭" }, venue: "Boston", kickoffUtc: 1782244800, result: { homeScore: 0, awayScore: 0, yesWins: false, isDraw: true } },
  { no: 46, group: "L", slug: "panama-croatia", home: { name: "Panama", flag: "🇵🇦" }, away: { name: "Croatia", flag: "🇭🇷" }, venue: "Toronto", kickoffUtc: 1782255600, result: { homeScore: 0, awayScore: 1, yesWins: false, isDraw: false } },
  { no: 47, group: "K", slug: "portugal-uzbekistan", home: { name: "Portugal", flag: "🇵🇹" }, away: { name: "Uzbekistan", flag: "🇺🇿" }, venue: "Houston", kickoffUtc: 1782234000, result: { homeScore: 5, awayScore: 0, yesWins: true, isDraw: false } },
  { no: 48, group: "K", slug: "colombia-dr-congo", home: { name: "Colombia", flag: "🇨🇴" }, away: { name: "DR Congo", flag: "🇨🇩" }, venue: "Guadalajara", kickoffUtc: 1782266400, result: { homeScore: 1, awayScore: 0, yesWins: true, isDraw: false } },
  { no: 49, group: "C", slug: "scotland-brazil", home: { name: "Scotland", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" }, away: { name: "Brazil", flag: "🇧🇷" }, venue: "Miami", kickoffUtc: 1782338400, result: { homeScore: 0, awayScore: 3, yesWins: false, isDraw: false } },
  { no: 50, group: "C", slug: "morocco-haiti", home: { name: "Morocco", flag: "🇲🇦" }, away: { name: "Haiti", flag: "🇭🇹" }, venue: "Atlanta", kickoffUtc: 1782338400, result: { homeScore: 4, awayScore: 2, yesWins: true, isDraw: false } },
  { no: 51, group: "B", slug: "switzerland-canada", home: { name: "Switzerland", flag: "🇨🇭" }, away: { name: "Canada", flag: "🇨🇦" }, venue: "Vancouver", kickoffUtc: 1782327600, result: { homeScore: 2, awayScore: 1, yesWins: true, isDraw: false } },
  { no: 52, group: "B", slug: "bosnia-and-herzegovina-qatar", home: { name: "Bosnia and Herzegovina", flag: "🇧🇦" }, away: { name: "Qatar", flag: "🇶🇦" }, venue: "Seattle", kickoffUtc: 1782327600, result: { homeScore: 3, awayScore: 1, yesWins: true, isDraw: false } },
  { no: 53, group: "A", slug: "czechia-mexico", home: { name: "Czechia", flag: "🇨🇿" }, away: { name: "Mexico", flag: "🇲🇽" }, venue: "Mexico City", kickoffUtc: 1782349200, result: { homeScore: 0, awayScore: 3, yesWins: false, isDraw: false } },
  { no: 54, group: "A", slug: "south-africa-south-korea", home: { name: "South Africa", flag: "🇿🇦" }, away: { name: "South Korea", flag: "🇰🇷" }, venue: "Monterrey", kickoffUtc: 1782349200, result: { homeScore: 1, awayScore: 0, yesWins: true, isDraw: false } },
  { no: 55, group: "E", slug: "curacao-cote-d-ivoire", home: { name: "Curacao", flag: "🇨🇼" }, away: { name: "Cote d'Ivoire", flag: "🇨🇮" }, venue: "Philadelphia", kickoffUtc: 1782417600, result: { homeScore: 0, awayScore: 2, yesWins: false, isDraw: false } },
  { no: 56, group: "E", slug: "ecuador-germany", home: { name: "Ecuador", flag: "🇪🇨" }, away: { name: "Germany", flag: "🇩🇪" }, venue: "New York / New Jersey", kickoffUtc: 1782417600, result: { homeScore: 2, awayScore: 1, yesWins: true, isDraw: false } },
  { no: 57, group: "F", slug: "japan-sweden", home: { name: "Japan", flag: "🇯🇵" }, away: { name: "Sweden", flag: "🇸🇪" }, venue: "Dallas", kickoffUtc: 1782428400, result: { homeScore: 1, awayScore: 1, yesWins: false, isDraw: true } },
  { no: 58, group: "F", slug: "tunisia-netherlands", home: { name: "Tunisia", flag: "🇹🇳" }, away: { name: "Netherlands", flag: "🇳🇱" }, venue: "Kansas City", kickoffUtc: 1782428400, result: { homeScore: 1, awayScore: 3, yesWins: false, isDraw: false } },
  { no: 59, group: "D", slug: "turkey-usa", home: { name: "Turkey", flag: "🇹🇷" }, away: { name: "USA", flag: "🇺🇸" }, venue: "Los Angeles", kickoffUtc: 1782439200, result: { homeScore: 3, awayScore: 2, yesWins: true, isDraw: false } },
  { no: 60, group: "D", slug: "paraguay-australia", home: { name: "Paraguay", flag: "🇵🇾" }, away: { name: "Australia", flag: "🇦🇺" }, venue: "San Francisco", kickoffUtc: 1782439200, result: { homeScore: 0, awayScore: 0, yesWins: false, isDraw: true } },
  { no: 61, group: "I", slug: "norway-france", home: { name: "Norway", flag: "🇳🇴" }, away: { name: "France", flag: "🇫🇷" }, venue: "Boston", kickoffUtc: 1782500400, result: { homeScore: 1, awayScore: 4, yesWins: false, isDraw: false }, contract: "0xf83724DE940Eb51850CD89d11e304b9002E5D375", chain: "arc-testnet" },
  { no: 62, group: "I", slug: "senegal-iraq", home: { name: "Senegal", flag: "🇸🇳" }, away: { name: "Iraq", flag: "🇮🇶" }, venue: "Toronto", kickoffUtc: 1782500400, result: { homeScore: 5, awayScore: 0, yesWins: true, isDraw: false } },
  { no: 63, group: "G", slug: "egypt-iran", home: { name: "Egypt", flag: "🇪🇬" }, away: { name: "Iran", flag: "🇮🇷" }, venue: "Seattle", kickoffUtc: 1782529200, result: { homeScore: 1, awayScore: 1, yesWins: false, isDraw: true } },
  { no: 64, group: "G", slug: "new-zealand-belgium", home: { name: "New Zealand", flag: "🇳🇿" }, away: { name: "Belgium", flag: "🇧🇪" }, venue: "Vancouver", kickoffUtc: 1782529200, result: { homeScore: 1, awayScore: 5, yesWins: false, isDraw: false } },
  { no: 65, group: "H", slug: "cape-verde-saudi-arabia", home: { name: "Cape Verde", flag: "🇨🇻" }, away: { name: "Saudi Arabia", flag: "🇸🇦" }, venue: "Houston", kickoffUtc: 1782518400, result: { homeScore: 0, awayScore: 0, yesWins: false, isDraw: true } },
  { no: 66, group: "H", slug: "uruguay-spain", home: { name: "Uruguay", flag: "🇺🇾" }, away: { name: "Spain", flag: "🇪🇸" }, venue: "Guadalajara", kickoffUtc: 1782518400, result: { homeScore: 0, awayScore: 1, yesWins: false, isDraw: false } },
  { no: 67, group: "L", slug: "panama-england", home: { name: "Panama", flag: "🇵🇦" }, away: { name: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" }, venue: "New York / New Jersey", kickoffUtc: 1782594000, result: { homeScore: 0, awayScore: 2, yesWins: false, isDraw: false } },
  { no: 68, group: "L", slug: "croatia-ghana", home: { name: "Croatia", flag: "🇭🇷" }, away: { name: "Ghana", flag: "🇬🇭" }, venue: "Philadelphia", kickoffUtc: 1782594000, result: { homeScore: 2, awayScore: 1, yesWins: true, isDraw: false } },
  { no: 69, group: "J", slug: "algeria-austria", home: { name: "Algeria", flag: "🇩🇿" }, away: { name: "Austria", flag: "🇦🇹" }, venue: "Kansas City", kickoffUtc: 1782612000, result: { homeScore: 3, awayScore: 3, yesWins: false, isDraw: true } },
  { no: 70, group: "J", slug: "jordan-argentina", home: { name: "Jordan", flag: "🇯🇴" }, away: { name: "Argentina", flag: "🇦🇷" }, venue: "Dallas", kickoffUtc: 1782612000, result: { homeScore: 1, awayScore: 3, yesWins: false, isDraw: false } },
  { no: 71, group: "K", slug: "colombia-portugal", home: { name: "Colombia", flag: "🇨🇴" }, away: { name: "Portugal", flag: "🇵🇹" }, venue: "Miami", kickoffUtc: 1782603000, result: { homeScore: 0, awayScore: 0, yesWins: false, isDraw: true } },
  { no: 72, group: "K", slug: "dr-congo-uzbekistan", home: { name: "DR Congo", flag: "🇨🇩" }, away: { name: "Uzbekistan", flag: "🇺🇿" }, venue: "Atlanta", kickoffUtc: 1782603000, result: { homeScore: 3, awayScore: 1, yesWins: true, isDraw: false } },
]

export function wcMatchBySlug(slug: string): WcMatch | undefined {
  return WC_MATCHES.find((m) => m.slug === slug)
}

export function wcQuestion(m: WcMatch): string {
  return `${m.home.name} vs ${m.away.name}/${m.home.name}`
}
