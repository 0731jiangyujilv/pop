# POP Submission Evidence

POP / OddsShift is deployed and exercised on Robinhood Chain Testnet using Paxos USDG.

## Live deployment

- Chain: Robinhood Chain Testnet
- Chain ID: `46630`
- EventMarketV2: `0x4F946Cca7f8da191168f76Fe12fbD6cfa1CAA26e`
- Paxos USDG: `0x7E955252E15c84f5768B83c41a71F9eba181802F`

## Verification

Sourcify independently returned:

- `exact_match`
- creation: `exact_match`
- runtime: `exact_match`

See:

- `DEPLOYMENT_AND_VERIFICATION.md`
- `sourcify-verification.json`
- `blockscout-forwarding-status.json`

## Live OddsShift evidence

The live testnet lifecycle exercised:

1. shock detection
2. reverted-shock protection refund
3. sub-threshold non-cause protection
4. sustained toxic repricing
5. toxic protection transfer to LPs
6. permissionless stale resolution
7. trader rebate payout
8. LP reward payout

Final state:

- 20 trades
- 20 resolved
- 4 shocks
- 0 pending trades
- 0 pending escrow
- 0 trader rebates owed
- 0 LP rewards owed

See:

- `LIVE_ODDSHIFT_LIFECYCLE.md`
- `final-state.txt`
- `receipts/`

## Final economics

- Protection refunded: `0.251299 USDG`
- Toxic protection to LPs: `0.284252 USDG`
- Base fees to LPs: `0.229516 USDG`
- Total LP payout: `0.513768 USDG`

See `DEMO_CHECKLIST.md` for the judge-facing demo sequence.
