// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console} from "forge-std/Script.sol";
import {IEventMarketV2} from "../src/interfaces/IEventMarketV2.sol";
import {OddsShiftFlowBase} from "./OddsShiftFlowBase.sol";

/// @title OddsShiftToxicFlow
/// @notice The demo that ENDS IN NO REFUND. Same spam, same marked shock — but
///         nobody brings the probability back, so the repricing is judged real
///         and every trade that caused it forfeits the full 1%.
///
/// The shape, with the demo defaults (jump 5 points over 5 trades, contribution
/// line 1 point, observation 5 trades):
///
///   #0..#4   buyYes, +1.5 points each  -> net +7.5 -> the window is MARKED
///   #5..#9   buyYes, +1.5 points each  -> the observation window runs out with
///            the market still displaced -> the shock turns TOXIC
///              -> #0..#4 each moved more than 1 point in the shock's own
///                 direction, so all five are Charged
///              -> #5..#9 immediately form the next window, also over the jump
///                 line, so a second shock opens and they stay pending
///
/// Nothing is refunded. Run `--sig "finalize()"` after the cooldown and the
/// second window is charged too, leaving 10/10 trades at the full 1%.
///
/// Every trade here is deliberately over the contribution line. Splitting the
/// same flow into sub-1-point pieces would still mark the window but escape the
/// charge — that hole is recorded in `oddsshift_todos.md` section 4.1.
///
/// Precondition: the market's OddsShift queue must be EMPTY, so that trade #0
/// of the push starts a fresh window. Run `--sig "finalize()"` on whichever
/// flow ran last before starting another; {OddsShiftFlowBase-_requireDrained}
/// refuses the run otherwise.
///
/// Usage:
///   OS_MARKET=0x... forge script script/OddsShiftToxicFlow.s.sol \
///     --rpc-url base_sepolia --broadcast
///
///   # once the market has been quiet for `cooldown` seconds:
///   OS_MARKET=0x... forge script script/OddsShiftToxicFlow.s.sol \
///     --sig "finalize()" --rpc-url base_sepolia --broadcast
contract OddsShiftToxicFlow is OddsShiftFlowBase {
    /// @dev Anchor of the whole demo: the probability before trade #0.
    uint64 internal p0;
    /// @dev Per-trade climb. Over the contribution line on purpose.
    uint64 internal step;

    function run() external {
        _load();
        _reportParams();
        _requireDrained();

        IEventMarketV2.OddsShiftInfo memory before = m.getOddsShiftInfo();
        _plan(before);

        vm.startBroadcast(pk);
        _prepare();
        _push(before.lookback, before.observeWindow);
        vm.stopBroadcast();

        console.log("");
        _verify(before);
        _report();
        _tradeTable();
        _epilogue();
    }

    /// @notice `resolveStale()` for the second window this flow leaves open.
    ///         The market is still displaced, so it settles toxic as well.
    function finalize() external {
        _finalizeQueue();
    }

    /*//////////////////////////////////////////////////////////////
                                 PLAN
    //////////////////////////////////////////////////////////////*/

    function _plan(IEventMarketV2.OddsShiftInfo memory i) internal {
        p0 = _prob();

        // Comfortably above the contribution line, and steep enough that
        // `lookback` of them trip the jump line on their own.
        step = uint64(i.contribThreshold) * 3 / 2;
        uint64 minStep = uint64(i.jumpThreshold) / uint64(i.lookback) + POINT / 10;
        if (step < minStep) step = minStep;

        uint256 total = uint256(i.lookback) + i.observeWindow;

        require(step > i.contribThreshold, "trades would not count as causes");
        require(step * i.lookback > i.jumpThreshold, "climb would not trip the window");
        // The observation trades become the next window the moment the first
        // one closes. Keeping them over the jump line too means they open a
        // second shock instead of retiring as RefundedNoShock — no refunds
        // anywhere in this flow.
        require(step * i.observeWindow > i.jumpThreshold, "observation window would retire clean");
        require(
            uint256(p0) + step * total < PROB_ONE - 5 * POINT, "market is too close to 100%"
        );

        console.log("--- plan ---");
        console.log(
            string.concat(
                "  ",
                vm.toString(total),
                " buys of ",
                _signedPts(0, step),
                " pts, one direction, from ",
                _pct(p0),
                " to ",
                _pct(p0 + uint64(step * total))
            )
        );
        console.log(
            string.concat(
                "  mark at trade #",
                vm.toString(uint256(i.totalTrades) + i.lookback - 1),
                ", toxic at trade #",
                vm.toString(uint256(i.totalTrades) + total - 1),
                " - the probability never comes back"
            )
        );
        console.log("");
        console.log("--- flow ---");
    }

    /*//////////////////////////////////////////////////////////////
                                 FLOW
    //////////////////////////////////////////////////////////////*/

    /// @dev One long push in a single direction: `lookback` trades to trip the
    ///      window, then `observeWindow` more to run the observation out.
    function _push(uint32 lookback, uint32 observeWindow) internal {
        uint256 total = uint256(lookback) + observeWindow;
        for (uint256 j = 1; j <= total; ++j) {
            string memory note = "";
            if (j == lookback) note = "<- MARK: the window trips here";
            else if (j == total) note = "<- TOXIC: observation ran out, the window is charged";
            _tradeTo(p0 + uint64(step * j), note);
        }
    }

    /*//////////////////////////////////////////////////////////////
                                VERIFY
    //////////////////////////////////////////////////////////////*/

    function _verify(IEventMarketV2.OddsShiftInfo memory before) internal view {
        IEventMarketV2.OddsShiftInfo memory after_ = m.getOddsShiftInfo();

        // One shock closed toxic, and the observation trades opened the next.
        require(after_.totalShocks == before.totalShocks + 2, "expected two new shocks");
        IEventMarketV2.Shock memory s = m.getShocks(after_.totalShocks - 2, 1)[0];
        require(
            s.outcome == uint8(IEventMarketV2.ShockOutcome.Toxic),
            "shock did not turn toxic - check the pool depth"
        );
        require(after_.cumRebated == before.cumRebated, "something was refunded");
        require(after_.cumChargedFee > before.cumChargedFee, "nothing was charged");
        _requireAllCharged(s);

        console.log("--- result: TOXIC FLOW ---");
        console.log(
            string.concat(
                "  shock #",
                vm.toString(after_.totalShocks - 2),
                " marked at ",
                _pct(s.pShock),
                ", still at ",
                _pct(s.pEnd),
                " when the observation ran out (anchor ",
                _pct(s.pAnchor),
                ")"
            )
        );
        console.log(
            string.concat(
                "  charged this run: ",
                _amt(after_.cumChargedFee - before.cumChargedFee),
                "   refunded: 0"
            )
        );
        console.log("");
    }

    /// @dev Every trade in the window pushed the market the same way by more
    ///      than the contribution line, so the tiered charge should hit all of
    ///      them. If it does not, the sizing drifted.
    function _requireAllCharged(IEventMarketV2.Shock memory s) internal view {
        uint256 n = uint256(s.triggerId) - s.firstId + 1;
        IEventMarketV2.Trade[] memory ts = m.getTrades(s.firstId, n);
        for (uint256 i = 0; i < ts.length; ++i) {
            require(
                ts[i].outcome == uint8(IEventMarketV2.TradeOutcome.Charged),
                "a window trade escaped the charge"
            );
        }
    }

    function _epilogue() internal view {
        IEventMarketV2.OddsShiftInfo memory i = m.getOddsShiftInfo();
        console.log("--- next ---");
        console.log(string.concat("  page : /oddsshift/", vm.toString(address(m))));
        console.log("  the charged fees went to LPs - claimLpReward() collects them");
        if (i.pendingCount > 0) {
            console.log(
                string.concat(
                    "  ",
                    vm.toString(i.pendingCount),
                    " trades are still under shock #",
                    vm.toString(i.openShockId),
                    ". After ",
                    vm.toString(uint256(i.cooldown)),
                    "s of quiet, --sig \"finalize()\" charges them too."
                )
            );
        }
    }
}
