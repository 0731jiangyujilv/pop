// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {EventMarketV2} from "../src/EventMarketV2.sol";
import {IEventMarket} from "../src/interfaces/IEventMarket.sol";
import {IEventMarketV2} from "../src/interfaces/IEventMarketV2.sol";

/// @title OddsShiftFlowBase
/// @notice Shared machinery for the two OddsShift demo flows,
///         {OddsShiftFairFlow} and {OddsShiftToxicFlow}.
///
/// @dev The demos have to hit probability targets exactly, not "roughly 12
///      USDC", because both verdicts turn on threshold comparisons. The pool
///      also gets deeper every time a demo runs, so hardcoded sizes would drift
///      out of calibration after the first pass — and the demo token has 18
///      decimals, not 6.
///
///      So the sizes are solved for instead. With `Y = yesReserve`,
///      `N = noReserve` and `k = Y * N`:
///
///          p_yes = N / (Y + N) = N^2 / (N^2 + k)
///
///      A buy of `n` (post-fee) grows one reserve by `n` and leaves `k`
///      untouched — every buy and sell here is k-preserving — so reaching a
///      target `p` has a closed form:
///
///          buyYes  ->  N_target = sqrt(k * p / (1 - p))  ,  n = N_target - N
///          buyNo   ->  Y_target = sqrt(k * (1 - p) / p)  ,  n = Y_target - Y
///
///      Gross that up by the 1% entry fee and it is the number to pass in.
abstract contract OddsShiftFlowBase is Script {
    uint256 internal constant PROB_ONE = 1e6;
    uint256 internal constant BPS = 10_000;

    /// @dev One probability point, in the contract's 1e6 fixed point.
    uint64 internal constant POINT = 10_000;

    /// @dev Every log reader is paged; nothing in a demo comes close.
    uint256 internal constant PAGE = 1_000;

    EventMarketV2 internal m;
    IERC20Metadata internal token;
    uint8 internal dec;
    string internal sym;

    uint256 internal pk;
    address internal trader;

    /*//////////////////////////////////////////////////////////////
                                 SETUP
    //////////////////////////////////////////////////////////////*/

    /// @dev Required env: `PRIVATE_KEY`, and `OS_MARKET` — the address
    ///      {DeployEventMarketV2} printed.
    function _load() internal {
        pk = _privateKey();
        trader = vm.addr(pk);

        address marketAddr = _marketAddress();
        require(marketAddr != address(0), "OS_MARKET required");
        m = EventMarketV2(marketAddr);

        require(m.status() == IEventMarket.Status.Open, "market is not Open");
        require(block.timestamp < m.bettingDeadline(), "bettingDeadline has passed");
        require(m.totalLpShares() > 0, "market was never initialized");

        token = IERC20Metadata(address(m.usdc()));
        dec = token.decimals();
        sym = token.symbol();
    }

    /// @dev Where a flow gets its inputs. Both are hooks so a test can point a
    ///      flow at a market it just deployed, instead of round-tripping the
    ///      address through the process environment; `forge script` reads env.
    function _privateKey() internal view virtual returns (uint256) {
        return vm.envUint("PRIVATE_KEY");
    }

    function _marketAddress() internal view virtual returns (address) {
        return vm.envAddress("OS_MARKET");
    }

    /// @dev Top the trader up and approve once, so the flow itself is nothing
    ///      but trades. `mint(address,uint256)` is the MockUSDC faucet; against
    ///      a real token the call fails and the operator is told to fund the
    ///      account by hand.
    function _prepare() internal {
        uint256 budget = m.yesReserve() + m.noReserve(); // ~5x the deepest demo
        if (token.balanceOf(trader) < budget) {
            (bool ok,) = address(token).call(abi.encodeWithSignature("mint(address,uint256)", trader, budget));
            require(ok, "not enough balance and the token has no open mint() - fund the trader");
        }
        if (token.allowance(trader, address(m)) < budget) {
            token.approve(address(m), type(uint256).max);
        }
    }

    /// @dev Both demos plan their windows from the live probability, which is
    ///      only the next window's anchor when the queue is empty. Left-overs —
    ///      the pending tail a fair run ends with, the open shock a toxic run
    ///      ends with — get pulled into this run's windows instead, and then the
    ///      verdicts stop matching the story. Worst case, the PREVIOUS demo's
    ///      leftovers are judged by THIS demo's order flow: a fair run whose
    ///      climb runs an old shock's observation window out to TOXIC charges
    ///      trades it never made, and trips its own `cumChargedFee` assertion
    ///      at the very end — long after the money moved.
    ///
    ///      So the precondition is stated up front, before a single trade is
    ///      sent. `pendingCount == 0` covers the open shock too: a shock holds
    ///      its own window pending until it is decided.
    function _requireDrained() internal view {
        IEventMarketV2.OddsShiftInfo memory i = m.getOddsShiftInfo();
        if (i.pendingCount == 0) return;

        console.log("--- cannot start: the previous demo is still unsettled ---");
        console.log(
            string.concat(
                "  ",
                vm.toString(i.pendingCount),
                " trades pending from #",
                vm.toString(i.nextToResolve),
                i.shockOpen ? string.concat(", under open shock #", vm.toString(i.openShockId)) : ""
            )
        );
        console.log("  Drain the queue first, then run this flow again:");
        console.log("    forge script <this flow> --sig \"finalize()\" --rpc-url ... --broadcast");

        uint256 ready = uint256(m.getTrades(i.totalTrades - 1, 1)[0].ts) + i.cooldown;
        if (block.timestamp < ready) {
            console.log(
                string.concat(
                    "  (resolveStale() needs ",
                    vm.toString(uint256(i.cooldown)),
                    "s of quiet - ",
                    vm.toString(ready - block.timestamp),
                    "s left)"
                )
            );
        }

        revert("OddsShift queue is not drained - run --sig \"finalize()\" first");
    }

    /*//////////////////////////////////////////////////////////////
                            SIZING + TRADING
    //////////////////////////////////////////////////////////////*/

    function _prob() internal view returns (uint64) {
        uint256 total = m.yesReserve() + m.noReserve();
        if (total == 0) return uint64(PROB_ONE / 2);
        return uint64(m.noReserve() * PROB_ONE / total);
    }

    /// @return gross Total token amount to hand {EventMarketV2.buyYes} /
    ///         {EventMarketV2.buyNo}, the 1% entry fee included.
    /// @return yesSide True when reaching `pTarget` means buying YES.
    function _quoteMoveTo(uint64 pTarget) internal view returns (uint256 gross, bool yesSide) {
        require(pTarget > 0 && pTarget < PROB_ONE, "probability target out of range");

        uint256 y = m.yesReserve();
        uint256 n = m.noReserve();
        uint256 k = y * n;
        uint64 p = _prob();
        require(pTarget != p, "already at the target");

        uint256 net;
        if (pTarget > p) {
            uint256 nT = Math.sqrt(k * pTarget / (PROB_ONE - pTarget));
            require(nT > n, "target unreachable by buying YES");
            net = nT - n + 1; // +1 absorbs the sqrt truncation
            yesSide = true;
        } else {
            uint256 yT = Math.sqrt(k * (PROB_ONE - pTarget) / pTarget);
            require(yT > y, "target unreachable by buying NO");
            net = yT - y + 1;
        }

        // The contract floors both fee slices, so grossing up at the nominal
        // rate always leaves at least `net` entering the curve.
        uint256 keep = BPS - m.baseFeeBps() - m.protectionFeeBps();
        gross = Math.ceilDiv(net * BPS, keep);
    }

    /// @dev One demo trade, sized to land on `pTarget`. Runs inside a broadcast.
    function _tradeTo(uint64 pTarget, string memory note) internal {
        (uint256 gross, bool yesSide) = _quoteMoveTo(pTarget);

        uint64 pBefore = _prob();
        if (yesSide) m.buyYes(gross, 0);
        else m.buyNo(gross, 0);
        uint64 pAfter = _prob();

        console.log(
            string.concat(
                "  #",
                vm.toString(m.getOddsShiftInfo().totalTrades - 1),
                yesSide ? "  buyYes " : "  buyNo  ",
                _amt(gross),
                "   ",
                _pct(pBefore),
                " -> ",
                _pct(pAfter),
                " (",
                _signedPts(pBefore, pAfter),
                " pts)   ",
                note
            )
        );
    }

    /// @dev Sweep the trader's rebate, if the flow produced one.
    function _claimRebate() internal {
        uint256 amt = m.rebateClaimable(trader);
        if (amt == 0) {
            console.log("  nothing to claim - no escrow was refunded");
            return;
        }
        m.claimRebate();
        console.log(string.concat("  claimRebate() paid out ", _amt(amt)));
    }

    /*//////////////////////////////////////////////////////////////
                             TIME FALLBACK
    //////////////////////////////////////////////////////////////*/

    /// @dev `resolveStale()`, with the cooldown checked first so the operator
    ///      gets a countdown instead of a raw revert. Shared entry point for
    ///      both flows: whatever a flow leaves pending, this settles.
    function _finalizeQueue() internal {
        _load();

        IEventMarketV2.OddsShiftInfo memory i = m.getOddsShiftInfo();
        if (i.pendingCount == 0) {
            console.log("Nothing pending - the queue is already settled.");
            return;
        }

        uint256 lastTs = m.getTrades(i.totalTrades - 1, 1)[0].ts;
        uint256 ready = lastTs + i.cooldown;
        if (block.timestamp < ready) {
            console.log(
                string.concat(
                    "Cooldown has ",
                    vm.toString(ready - block.timestamp),
                    "s left (the market has to go quiet first). Try again after that."
                )
            );
            return;
        }

        vm.startBroadcast(pk);
        m.resolveStale();
        vm.stopBroadcast();

        console.log("resolveStale() drained the queue at the current probability.");
        console.log("");
        _report();
        _tradeTable();
    }

    /*//////////////////////////////////////////////////////////////
                               REPORTING
    //////////////////////////////////////////////////////////////*/

    function _reportParams() internal view {
        IEventMarketV2.OddsShiftInfo memory i = m.getOddsShiftInfo();
        console.log("--- market ---");
        console.log(string.concat("  market      : ", vm.toString(address(m))));
        console.log(string.concat("  question    : ", m.question()));
        console.log(string.concat("  collateral  : ", _amt(m.totalCollateral())));
        console.log(string.concat("  probability : ", _pct(_prob())));
        console.log(
            string.concat("  fee         : ", _bps(i.baseFeeBps), " base + ", _bps(i.protectionFeeBps), " protection")
        );
        console.log(
            string.concat(
                "  thresholds  : jump ",
                _pct(uint64(i.jumpThreshold)),
                " over ",
                vm.toString(uint256(i.lookback)),
                " trades / contribution ",
                _pct(uint64(i.contribThreshold)),
                " / observe ",
                vm.toString(uint256(i.observeWindow)),
                " trades"
            )
        );
        console.log("");
    }

    function _report() internal view {
        IEventMarketV2.OddsShiftInfo memory i = m.getOddsShiftInfo();
        IEventMarketV2.OddsShiftUserState memory u = m.getUserOddsShift(trader);

        console.log("--- OddsShift state ---");
        console.log(
            string.concat(
                "  trades       : ",
                vm.toString(i.totalTrades),
                " (",
                vm.toString(i.pendingCount),
                " pending, next to judge #",
                vm.toString(i.nextToResolve),
                ")"
            )
        );
        console.log(
            string.concat(
                "  shocks       : ",
                vm.toString(i.totalShocks),
                i.shockOpen ? string.concat(" (#", vm.toString(i.openShockId), " still observing)") : ""
            )
        );
        console.log(string.concat("  escrow held  : ", _amt(i.pendingEscrow)));
        console.log(string.concat("  LPs, base    : ", _amt(i.cumBaseFee), "  (never refundable)"));
        console.log(string.concat("  LPs, toxic   : ", _amt(i.cumChargedFee)));
        console.log(string.concat("  to traders   : ", _amt(i.cumRebated)));
        console.log("");
        console.log("--- your account ---");
        console.log(string.concat("  rebate claimable : ", _amt(u.rebateClaimable)));
        console.log(string.concat("  escrow pending   : ", _amt(u.pendingEscrow)));
        console.log(string.concat("  LP reward        : ", _amt(u.lpRewardClaimable)));
        console.log(string.concat("  wallet           : ", _amt(token.balanceOf(trader))));
        console.log("");
    }

    function _tradeTable() internal view {
        IEventMarketV2.Trade[] memory ts = m.getTrades(0, PAGE);
        console.log("--- verdicts ---");
        for (uint256 i = 0; i < ts.length; ++i) {
            console.log(
                string.concat(
                    "  #",
                    vm.toString(i),
                    "  ",
                    _pct(ts[i].pBefore),
                    " -> ",
                    _pct(ts[i].pAfter),
                    " (",
                    _signedPts(ts[i].pBefore, ts[i].pAfter),
                    " pts)  escrow ",
                    _amt(ts[i].escrow),
                    "  ",
                    _outcome(ts[i].outcome)
                )
            );
        }
        console.log("");
    }

    function _outcome(uint8 o) internal pure returns (string memory) {
        if (o == uint8(IEventMarketV2.TradeOutcome.Pending)) return "PENDING";
        if (o == uint8(IEventMarketV2.TradeOutcome.RefundedNoShock)) return "REFUNDED (no shock)";
        if (o == uint8(IEventMarketV2.TradeOutcome.RefundedReverted)) return "REFUNDED (reverted)";
        if (o == uint8(IEventMarketV2.TradeOutcome.RefundedMinor)) return "REFUNDED (not a cause)";
        return "CHARGED (toxic cause)";
    }

    /*//////////////////////////////////////////////////////////////
                              FORMATTING
    //////////////////////////////////////////////////////////////*/

    /// @dev 1e6 fixed point as a percentage, two decimals.
    function _pct(uint64 p) internal pure returns (string memory) {
        return string.concat(vm.toString(uint256(p) / 10_000), ".", _pad2(uint256(p) % 10_000 / 100), "%");
    }

    /// @dev Signed displacement between two probabilities, in points.
    function _signedPts(uint64 a, uint64 b) internal pure returns (string memory) {
        (uint256 d, bool neg) = b >= a ? (uint256(b - a), false) : (uint256(a - b), true);
        return string.concat(neg ? "-" : "+", vm.toString(d / POINT), ".", _pad2(d % POINT / 100));
    }

    function _bps(uint16 v) internal pure returns (string memory) {
        return string.concat(vm.toString(uint256(v) / 100), ".", _pad2(uint256(v) % 100), "%");
    }

    /// @dev Token amount at the token's own decimals, truncated to four places.
    function _amt(uint256 v) internal view returns (string memory) {
        uint256 unit = 10 ** dec;
        string memory f = vm.toString(v % unit * 10_000 / unit);
        while (bytes(f).length < 4) {
            f = string.concat("0", f);
        }
        return string.concat(vm.toString(v / unit), ".", f, " ", sym);
    }

    function _pad2(uint256 v) internal pure returns (string memory) {
        return v < 10 ? string.concat("0", vm.toString(v)) : vm.toString(v);
    }
}
