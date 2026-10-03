# EventMarketV2 security triage

Scope: `contracts/src/EventMarketV2.sol`, `contracts/src/deployment/RobinhoodDeploymentPreflight.sol`, and `contracts/script/DeployRobinhoodEventMarketV2.s.sol`.

Original focused scan: local commit `7a43dfa` on 2026-10-03 with Slither 0.11.6 and Foundry 1.7.1. Re-verified after later local test-only, deploy-script-test, and `forge fmt` commits. No economic or permission bytecode was changed to silence a detector.

Commands (from `contracts/`):

```bash
slither src/EventMarketV2.sol --filter-paths 'lib/'
slither src/deployment/RobinhoodDeploymentPreflight.sol --filter-paths 'lib/'
slither script/DeployRobinhoodEventMarketV2.s.sol --filter-paths 'lib/'
forge build --sizes
```

The EventMarketV2-focused scan reports 24 detector results: 6 medium, 17 low, 1 informational, and no high or critical findings. The standalone preflight scan reports only the one `incorrect-equality` result listed below. The Robinhood deploy script compiles both surfaces and therefore reports the union: 25 results across the same five detector names.

All findings existed at the start of this remediation. The EventMarketV2 findings predate the Robinhood work; the preflight equality was introduced by the already-committed Robinhood deployment guard. Detector wording was not treated as proof of a bug. Each item was traced through reserve, escrow, fee, and permission flow.

No finding below can cause loss or lock of USDG, a duplicate payout, reserve corruption, unauthorized settlement, denial of settlement, or undercollateralization. Consequently no bytecode or OddsShift economic behavior is changed in this release gate.

## Focused Slither findings

### 1. `divide-before-multiply` — `_calcYesForNo`

| Field | Record |
| --- | --- |
| Detector | `divide-before-multiply` |
| Contract / function | `EventMarketV2._calcYesForNo` |
| Severity / confidence | Medium / Medium |
| New or pre-existing | Pre-existing AMM helper |
| Actual exploitability | None. The LP swap fee is applied first: `effectiveIn = yesIn * (BPS - lpSwapFeeBps) / BPS`, then the constant-product output is `noRes * effectiveIn / (yesRes + effectiveIn)`. Both divisions floor. |
| Financial consequence | Trader receives strictly less than or equal to the exact real-valued output. Lost units stay in reserves. The path cannot mint unbacked outcome tokens or withdraw extra USDG. |
| Decision | **ACCEPTED** |
| Reasoning | Conservative rounding is the intended solvency direction. Reordering the fee multiply/divide would change quote and trade semantics without closing a theft path. Dust is bounded by the two floors (less than one base unit each). |
| Supporting tests | `test_QuotesMatchActualFills`, `testFuzz_BuySellRoundTripCannotExtractCollateral`, buy/sell reserve-consistency tests |

### 2. `divide-before-multiply` — `_calcNoForYes`

| Field | Record |
| --- | --- |
| Detector | `divide-before-multiply` |
| Contract / function | `EventMarketV2._calcNoForYes` |
| Severity / confidence | Medium / Medium |
| New or pre-existing | Pre-existing AMM helper |
| Actual exploitability | None. Symmetric to #1 with the YES/NO legs swapped. |
| Financial consequence | Same bounded floor against the trader; reserves keep the dust. |
| Decision | **ACCEPTED** |
| Reasoning | Same conservative CPMM fee rounding as #1. No value-creation path. |
| Supporting tests | Same as #1 |

### 3. `divide-before-multiply` — `claimLpPayout`

| Field | Record |
| --- | --- |
| Detector | `divide-before-multiply` |
| Contract / function | `EventMarketV2.claimLpPayout` |
| Severity / confidence | Medium / Medium |
| New or pre-existing | Pre-existing settlement payout |
| Actual exploitability | None. Each LP receives `floor(reserve * shares / totalLpShares)` of each reserve, then `floor(share * netRate / ONE)`. `lpClaimed` is set before transfer. |
| Financial consequence | Each claimant is rounded down. Residual units remain in the contract as dust. No LP can be overpaid; a second claim reverts. |
| Decision | **ACCEPTED** |
| Reasoning | Floor-on-claim is the solvency-preserving order. Reordering would change payout semantics. EventMarketV2 has only 180 bytes of EIP-170 margin; a behavior-neutral rewrite to silence Slither is not justified. |
| Supporting tests | `test_LpPayoutIsPaidExactlyOnce`, `test_EscrowSurvivesSettlement`, `testFuzz_SettlementDrainLeavesOnlyRoundingDust` |

### 4. `incorrect-equality` — `deployer.balance == 0`

| Field | Record |
| --- | --- |
| Detector | `incorrect-equality` |
| Contract / function | `RobinhoodDeploymentPreflight.validate` |
| Severity / confidence | Medium / High |
| New or pre-existing | Pre-existing Robinhood guard (already committed before this remediation) |
| Actual exploitability | None. The comparison is an absence check: deployment must not proceed when the deployer has zero native balance. It is not an authorization, price, or accounting equality. |
| Financial consequence | None on-chain. A zero-balance deployer cannot broadcast. A 1-wei balance is accepted; Forge still estimates and funds the actual transaction only if a separately approved `--broadcast` is used. |
| Decision | **FALSE POSITIVE** |
| Reasoning | Slither flags strict equality on balances because that pattern is dangerous for *token amounts that can be manipulated by donations*. Here the only illegal value is exactly zero native gas. Rewriting to `balance < 1` would not change behavior and would only satisfy the detector. |
| Supporting tests | `test_RevertsOnInsufficientGasBalance`, `test_AcceptsMinimalPositiveGasBalance`, `test_RefusesZeroGasBalance` |

### 5. `uninitialized-local` — `getUserOddsShift.pending`

| Field | Record |
| --- | --- |
| Detector | `uninitialized-local` |
| Contract / function | `EventMarketV2.getUserOddsShift` |
| Severity / confidence | Medium / Medium |
| New or pre-existing | Pre-existing view helper |
| Actual exploitability | None. Solidity zero-initializes local `uint256`. The variable is a view-only sum of pending escrow. |
| Financial consequence | None. The function does not transfer, mint, or mutate storage. |
| Decision | **FALSE POSITIVE** |
| Reasoning | Explicit `= 0` would be cosmetic. The detector does not identify an uninitialized *storage* slot or a control-flow bug. |
| Supporting tests | `test_GetUserOddsShiftReportsPendingEscrow` |

### 6. `uninitialized-local` — `_closeShock.charged`

| Field | Record |
| --- | --- |
| Detector | `uninitialized-local` |
| Contract / function | `EventMarketV2._closeShock` |
| Severity / confidence | Medium / Medium |
| New or pre-existing | Pre-existing verdict accumulator |
| Actual exploitability | None. `charged` starts at zero and only increases by finalized trade escrow. Payment state is written in `_finalize`, not from this local. |
| Financial consequence | None beyond the already-tested verdict split. A zero start is the correct empty-window total. |
| Decision | **FALSE POSITIVE** |
| Reasoning | Event-only accumulator. Solidity zero-init is relied upon intentionally. |
| Supporting tests | `test_ToxicShockChargesOnlySameDirectionContributors`, `test_ChargedFeeSplitsProRataBetweenLps` |

### 7. `uninitialized-local` — `_closeShock.refunded`

| Field | Record |
| --- | --- |
| Detector | `uninitialized-local` |
| Contract / function | `EventMarketV2._closeShock` |
| Severity / confidence | Medium / Medium |
| New or pre-existing | Pre-existing verdict accumulator |
| Actual exploitability | None. Same as #6 for the refund side of the event. |
| Financial consequence | None. Refunds are credited in `_finalize` to `rebateClaimable`. |
| Decision | **FALSE POSITIVE** |
| Reasoning | Same Solidity zero-init as #6. |
| Supporting tests | `test_RevertedShockRefundsTheWholeWindowEarly`, `test_TradeSlidingOutOfTheWindowIsRefunded` |

### 8–13. Real timestamp dependence (accepted lifecycle semantics)

| # | Function | Role of `block.timestamp` | Exploitability | Decision | Supporting tests |
| --- | --- | --- | --- | --- | --- |
| 8 | `constructor` | Reject a betting deadline that is not in the future | Validator drift cannot bypass collateral or permissions | **ACCEPTED** | `test_RevertsOnInvalidOddsShiftParams`, deployment constructor coverage |
| 9 | `resolveStale` | Quiet-period cooldown before the permissionless fallback | Drift moves eligibility by seconds; it cannot change the flow-derived verdict or recipient | **ACCEPTED** | `test_ResolveStaleRevertsBeforeCooldown`, toxic/refund stale tests |
| 10 | `setSchedule` | Require a future schedule; admin-only | Cannot settle or extract funds | **ACCEPTED** | `test_ResolveAndScheduleAreAdminOnly`, `test_SettlementIsTerminal` |
| 11 | `_maybeLock` | Close trading at the configured deadline | Ordinary block-time boundary only | **ACCEPTED** | Trade methods call `_maybeLock` before reserve mutation |
| 12 | `resolve` | Earliest admin resolution time | Cannot grant admin rights or settle twice | **ACCEPTED** | `test_ResolveRespectsResolveAfterBoundary`, `test_SettlementIsTerminal` |
| 13 | `emergencyForceDraw` | Permissionless 24-hour draw fallback | Drift is insignificant vs 24h; path can only produce a draw | **ACCEPTED** | `test_EmergencyDrawRequiresLockAndFullTimelock` |

These are required deadline/timelock comparisons. Removing them would be a product change, not a security fix. Miner/validator timestamp latitude cannot produce material economic theft beyond the intended window semantics.

### 14–24. Timestamp detector false positives (indexes, counters, probabilities)

Slither's `timestamp` detector also fires on ordinary `<` / `>` comparisons. In the following functions the compared values are **not** timestamps:

| # | Function | Compared values | Decision | Supporting tests |
| --- | --- | --- | --- | --- |
| 14 | `_process` | `n`, `first`, `lookback` trade counts | **FALSE POSITIVE** | Bounded-window tests |
| 15 | `_openShock` | `pShock > anchor` probabilities; a timestamp is stored, not compared | **FALSE POSITIVE** | `test_WindowTripsOnFifthTradeAndRecordsTheShock` |
| 16 | `_tryCloseByFlow` | `n`, `deadline`, `end`, `i` trade indices | **FALSE POSITIVE** | Fair/toxic flow tests |
| 17 | `_closeShock` | `i`, `triggerId` trade indices | **FALSE POSITIVE** | Each indexed trade is finalized once |
| 18 | `_verdict` | signed `dir` probability-move direction | **FALSE POSITIVE** | `test_ToxicShockChargesOnlySameDirectionContributors` |
| 19 | `_flushAll` | queue indices vs array length | **FALSE POSITIVE** | Settlement and emergency flush tests |
| 20 | `_flushPartial` | `i`, `n` trade indices | **FALSE POSITIVE** | Stale displaced/undisplaced tests |
| 21 | `_absDiff` | two probabilities | **FALSE POSITIVE** | Pure helper |
| 22 | `_jumped` | probability displacement vs `jumpThreshold` | **FALSE POSITIVE** | Window-threshold tests |
| 23 | `getTrades` | pagination indices | **FALSE POSITIVE** | `test_GetTradesAndShocksClampAndRevert` |
| 24 | `getShocks` | pagination indices | **FALSE POSITIVE** | `test_GetTradesAndShocksClampAndRevert` |

### 25. `cyclomatic-complexity` — constructor

| Field | Record |
| --- | --- |
| Detector | `cyclomatic-complexity` |
| Contract / function | `EventMarketV2.constructor` |
| Severity / confidence | Informational / High |
| New or pre-existing | Pre-existing constructor validation |
| Actual exploitability | None. Branches are independent fail-closed checks (zero token, fee caps, deadline, OddsShift params). |
| Financial consequence | None. An invalid parameter reverts before any storage of market funds. |
| Decision | **ACCEPTED** |
| Reasoning | Complexity here is validation, not an alternate authorization or payment path. Splitting the constructor would add bytecode against a 180-byte EIP-170 margin. |
| Supporting tests | `test_RevertsOnInvalidOddsShiftParams`, `test_RevertsOnZeroCollateralToken`, Robinhood preflight/deploy-script tests |

## Manual financial and permission review

- **Reentrancy:** all external functions that transfer collateral or can reach a transfer are `nonReentrant`. Claim flags and claimable balances are cleared before `SafeERC20.safeTransfer`. `initializeMarket` makes no external token call and is factory-only/one-shot.
- **ERC-20 behavior:** contract calls use `SafeERC20`. Fee-on-transfer or rebasing assets are not supported generically. Robinhood deployment is pinned to the official USDG proxy, code, symbol, decimals, and deployer balances. No mock fallback exists on that path.
- **Fee and escrow conservation:** trade input is partitioned into curve collateral, base LP fee, and protection escrow. Finalization moves escrow exactly once to either trader rebate liability or LP reward liability.
- **Refund / LP payout exactly once:** rebate and reward balances are zeroed before transfer; settlement LP payouts set `lpClaimed` before transfer. Repeated claims revert.
- **Settlement exactly once:** both resolution paths require `Locked` and set terminal `Settled` before user claims. Admin resolution is `onlyAdmin`; the delayed public fallback can only produce a draw.
- **Zero paths:** V2 rejects zero collateral and zero initial liquidity. Robinhood preflight additionally rejects the wrong chain/token, missing code, invalid metadata, zero fee recipient, insufficient USDG, and zero gas balance.
- **Deployment size:** `forge build --sizes` reports EventMarketV2 runtime 24,396 bytes (180 bytes below the 24,576-byte EIP-170 limit) and initcode 27,051 bytes (22,101 bytes below the Shanghai 49,152-byte limit). That narrow runtime margin is a reason not to add behavior-neutral bytecode solely to silence false-positive detectors.
- **Proxy USDG risk:** the official USDG address is an EIP-1967 proxy. POP validates the proxy address and implementation code before deployment, but cannot prevent a Paxos-controlled implementation upgrade. Any change to code, symbol, decimals, transfer semantics, or funding remains a deployment stop condition requiring renewed review.

## Release decision

No security-relevant source fix is required by the focused findings.

| Class | Count | Action |
| --- | --- | --- |
| Conservative rounding (`divide-before-multiply`) | 3 | ACCEPTED |
| Fail-closed zero-balance guard (`incorrect-equality`) | 1 | FALSE POSITIVE |
| Solidity zero-init locals (`uninitialized-local`) | 3 | FALSE POSITIVE |
| Required deadline / timelock timestamps | 6 | ACCEPTED |
| Misclassified index / probability comparisons | 11 | FALSE POSITIVE |
| Constructor complexity | 1 | ACCEPTED |

The default Foundry suite (133 tests, 0 skipped) and `./scripts/slither-focused.sh` remain release gates. That script pins the EventMarketV2 baseline at 24 results across `divide-before-multiply`, `uninitialized-local`, `timestamp`, and `cyclomatic-complexity`, and the preflight baseline at one `incorrect-equality` result. Unexpected new detector categories or a change in these counts must fail review.
