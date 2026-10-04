# POP / OddsShift — Judge Demo

## Core idea

OddsShift does not attempt to determine whether a trader possesses private information.

It observes what happens after a large market repricing:

- if the move reverses, the protection fee is refunded;
- if causative repricing persists, the protection fee compensates LPs.

Every trade pays:

- `0.30%` base fee to LPs
- `0.70%` protection fee into escrow

## 1. Show the live market

Network: Robinhood Chain Testnet

EventMarketV2:

`0x4F946Cca7f8da191168f76Fe12fbD6cfa1CAA26e`

Collateral:

Paxos USDG

Question:

`Will BTC close above $100k this week?`

## 2. FAIR flow

Show:

`50.00% -> 57.00%`

Five trades cross the shock threshold.

Shock transaction:

`0x0c3f6abb3db4415f9d628a135a2451aa87429a06d4ba852d0d462409ef73f0b2`

Then:

`57.00% -> 49.99%`

Correction transaction:

`0x415e1e5b638aeb72be33f1bf377a19b8b8d23e5fcff02e41a90567c665d91120`

Explain:

The repricing reverted, so the protection portion was returned to traders while
the base LP fee remained non-refundable.

Initial refund transaction:

`0x0bd60b54ea200960fc3c8562514269d7bdaf60fb0e2a7e2dfa802717e047196b`

## 3. TOXIC flow

Show:

`53.50% -> 68.50%`

Ten directional trades sustain the repricing instead of returning toward the
anchor.

Final toxic trade:

`0x3d4620bac06d8e611afc8dc610aebfd55152ec783b2e912fdce302584460f17f`

Explain:

Trades that materially contributed to the persistent repricing forfeited their
protection escrow to LPs.

## 4. Contribution protection

The four earlier small FAIR tail trades remained in the queue when the later
move arrived.

They were not blindly charged.

Because their individual contribution was below the configured threshold, they
were refunded as non-causes while larger causative trades were charged.

## 5. Permissionless resolution

Final queue settlement:

`0x10813fe5cd67cff9129b561a8920b8a8e6f9b7ea7a927108b0e69cdec76f14fd`

`resolveStale()` settled the remaining queue after the cooldown.

## 6. Final accounting

- 20 total trades
- 20 resolved trades
- 4 shocks
- 0 pending trades
- 0 pending escrow
- 0 rebates owed
- 0 LP rewards owed

Lifetime economics:

- `0.251299 USDG` protection refunded
- `0.284252 USDG` toxic protection sent to LPs
- `0.229516 USDG` base fees sent to LPs
- `0.513768 USDG` total LP payout

Final LP payout:

`0x771d15fe70c65ff6a85413ece57a8193475a9e7f11d85275cd96e2754c778685`

## 7. Verification

The deployed contract has a Sourcify exact creation and runtime match.

Do not describe Blockscout as successfully verified. Its downstream forwarding
attempt returned `Fail - Unable to verify`; Sourcify exact-match verification is
the successful independent verification result.

## Recommended language

Use:

- reverted repricing
- sustained repricing
- causative trades
- contribution threshold
- observation window
- permissionless resolution

Avoid:

- detects insider trading
- knows informed traders
- every volatile trade is toxic
