# POP / OddsShift — Live Economic Lifecycle

All activity below executed on Robinhood Chain Testnet against:

`0x4F946Cca7f8da191168f76Fe12fbD6cfa1CAA26e`

using Paxos USDG.

## Fee model

Each trade pays:

- `0.30%` base fee -> LPs
- `0.70%` protection fee -> escrow until an OddsShift verdict

## FAIR flow

Starting probability: `50.00%`

Five YES trades moved the market:

`50.00 -> 51.40 -> 52.80 -> 54.20 -> 55.60 -> 57.00`

The fifth trade crossed the configured 5-point shock threshold.

Shock-mark transaction:

`0x0c3f6abb3db4415f9d628a135a2451aa87429a06d4ba852d0d462409ef73f0b2`

A NO trade then corrected the market:

`57.00 -> 49.99`

Correction transaction:

`0x415e1e5b638aeb72be33f1bf377a19b8b8d23e5fcff02e41a90567c665d91120`

The shock was classified as reverted and its protection escrow was refunded.

Initial rebate claim:

`0x0bd60b54ea200960fc3c8562514269d7bdaf60fb0e2a7e2dfa802717e047196b`

Four additional small FAIR trades moved:

`49.99 -> 50.87 -> 51.75 -> 52.62 -> 53.50`

Each move remained below the configured contribution threshold.

## TOXIC flow

Ten consecutive YES trades then moved the market:

`53.50 -> 55.00 -> 56.50 -> 58.00 -> 59.50 -> 61.00 -> 62.50 -> 64.00 -> 65.50 -> 67.00 -> 68.50`

The probability remained displaced instead of reverting.

Final toxic trade:

`0x3d4620bac06d8e611afc8dc610aebfd55152ec783b2e912fdce302584460f17f`

The previous small FAIR tail was not blindly penalized by the later toxic flow.
Sub-threshold trades were classified as non-causes and refunded while the
larger causative trades were charged.

## Permissionless resolution

The remaining queue was finalized after the cooldown using `resolveStale()`:

`0x10813fe5cd67cff9129b561a8920b8a8e6f9b7ea7a927108b0e69cdec76f14fd`

Final queue:

- total trades: `20`
- resolved trades: `20`
- pending trades: `0`
- total shocks: `4`
- open shock: `false`
- pending escrow: `0`

## Final payouts

Remaining trader rebate:

`0x1578e57cd947fb4874bc88426e660d0c7fa7042d37be7b64a34148054e6c56a2`

Amount: `0.051353 USDG`

LP reward:

`0x771d15fe70c65ff6a85413ece57a8193475a9e7f11d85275cd96e2754c778685`

Amount: `0.513768 USDG`

## Lifetime accounting

| Metric | Amount |
|---|---:|
| Base fees to LPs | `0.229516 USDG` |
| Toxic protection to LPs | `0.284252 USDG` |
| Protection refunded | `0.251299 USDG` |
| Total LP payout | `0.513768 USDG` |

Final liabilities:

- pending trades: `0`
- pending escrow: `0`
- trader rebates owed: `0`
- LP rewards owed: `0`

Final probability: `68.50%`

Final trader/LP wallet balance: `24.256125 USDG`
