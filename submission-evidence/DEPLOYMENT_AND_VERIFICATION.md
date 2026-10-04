# POP / OddsShift — Robinhood Chain Testnet Deployment

## Live deployment

| Item | Value |
|---|---|
| Network | Robinhood Chain Testnet |
| Chain ID | `46630` |
| EventMarketV2 | `0x4F946Cca7f8da191168f76Fe12fbD6cfa1CAA26e` |
| Paxos USDG | `0x7E955252E15c84f5768B83c41a71F9eba181802F` |
| Deployer | `0xA5B709025224bA08B8eFfF1b0D1d28E970A34Cf3` |
| Initial liquidity | `100 USDG` |
| Initial probability | `50.00%` |

Market:

`Will BTC close above $100k this week?`

## Deployment transactions

- Deploy:
  `0x6b3a39b82ea54c166694687df30bf47523c072658d22f45a40b2d77cda61e5ab`
- Fund with 100 USDG:
  `0xc45b2b28aa611f85b7a7f14d89c65b382562b1bc1625b77b54a5d9199a2e97bf`
- Initialize:
  `0x62f5587301c9f9d08ecf3b8d3e9115692208a4f048b1673f011b3516fce2cb5a`

## Compiler

- Solidity `0.8.24+commit.e11b9ed9`
- optimizer enabled
- optimizer runs `200`
- EVM version `cancun`
- `viaIR: true`
- metadata bytecode hash `ipfs`

## Source verification

Sourcify verification ID:

`e81be92a-9950-4d1e-a453-753456c39434`

Result:

- `match: exact_match`
- `creationMatch: exact_match`
- `runtimeMatch: exact_match`
- chain ID `46630`
- contract `0x4F946Cca7f8da191168f76Fe12fbD6cfa1CAA26e`

The original Foundry compilation contained 103 source units.

The initial reduced verification input contained only 16 source units. Verification
succeeded after using the complete Foundry build-info compilation input while
removing only unsupported Foundry wrapper fields.

Compiler settings remained byte-identical after sanitization:

`c5583148db9967144e53e9e5a9dfcbe9a6905ff68a6c936e98e5d284b6fcf98e`

The following relationship was independently confirmed:

`full build-info creation bytecode == local artifact creation bytecode == deployed creation bytecode`

Sourcify then returned exact creation and runtime matches.

## Blockscout

Sourcify's automatic forwarding attempt to Robinhood's Blockscout backend
returned:

`Fail - Unable to verify`

This is retained in `blockscout-forwarding-status.json` as a separate external
verifier result. The successful Sourcify exact-match verification is preserved
in `sourcify-verification.json`.

## Explorer

Contract:

`https://explorer.testnet.chain.robinhood.com/address/0x4F946Cca7f8da191168f76Fe12fbD6cfa1CAA26e`
