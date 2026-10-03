# Preserved legacy Foundry tests

These test sources were moved out of Foundry's default `test/` path during the POP release-gate remediation on 2026-10-03 in the commit named `build: isolate removed contract test fixtures`.

They are retained as historical artifacts and are not silently skipped by a Foundry pattern. They cannot currently compile because the production implementations they import were removed before this release-gate work:

| Test file | Removed production source(s) |
| --- | --- |
| `Bet.t.sol` | `Bet.sol` |
| `BetFactory.t.sol` | `BetFactory.sol`, `Bet.sol`, `PriceOracleFactory.sol` |
| `BetPoR.t.sol` | `BetPoR.sol` |
| `EventBet.t.sol` | `EventBet.sol`, `EventBetFactory.sol` |
| `PredictionMarket.t.sol` | `OutcomeToken.sol`, `PredictionMarket.sol`, `PredictionMarketFactory.sol` |
| `PriceOracleFactory.t.sol` | `PriceOracleFactory.sol`, `PriceOracle.sol` |
| `UpDownMarket.t.sol` | `UpDownOutcomeToken.sol`, `UpDownMarket.sol`, `UpDownMarketFactory.sol` |

Some interfaces with related names remain under `src/interfaces/`, but those interfaces are not deployable implementations and do not make these suites executable. No contract was recreated for the purpose of making historical tests green.

The active default suite remains in `contracts/test/` and includes `EventMarket`, `EventMarketV2`, Robinhood deployment preflight, OddsShift flow scripts, and their active mocks. The complete classification and treatment rationale is recorded in `docs/FOUNDRY_TEST_BASELINE.md`.

There is intentionally no passing `legacy` profile: these tests should only be reactivated if their exact production implementations are restored and reviewed.
