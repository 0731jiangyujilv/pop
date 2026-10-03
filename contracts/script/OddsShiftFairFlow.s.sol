// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console} from "forge-std/Script.sol";
import {IEventMarketV2} from "../src/interfaces/IEventMarketV2.sol";
import {OddsShiftFlowBase} from "./OddsShiftFlowBase.sol";

/// @title OddsShiftFairFlow
/// @notice The demo that ENDS IN A REFUND. Spams the market into a marked
///         shock, then corrects it, and every trade in the window gets its
///         0.70% protection fee back — a net cost of exactly 0.30%.
///
/// The shape, with the demo defaults (jump 5 points over 5 trades, contribution
/// line 1 point, observation 5 trades):
///
///   #0..#4   buyYes, +1.4 points each  -> net +7.0 -> the window is MARKED
///   #5       buyNo, all the way back to the anchor
///              -> the first observation trade is already inside anchor +/- 5
///              -> the shock closes REVERTED on the spot
///              -> #0..#4 all become RefundedReverted
///   #6..#9   four small buys, +0.875 points each (under the 1-point line)
///              -> #5..#9 form the next window, net -3.5, under the jump line
///              -> #5, the corrector, retires as RefundedNoShock too
///
/// Nothing is charged. The trader claims the whole escrow back at the end.
///
/// Precondition: the market's OddsShift queue must be EMPTY. Both flows leave
/// something behind — this one a four-trade tail, the toxic one an open shock —
/// and the plan below only holds when trade #0 of the climb starts a fresh
/// window. Run `--sig "finalize()"` on whichever flow ran last before starting
/// another; {OddsShiftFlowBase-_requireDrained} refuses the run otherwise.
///
/// Usage:
///   OS_MARKET=0x... forge script script/OddsShiftFairFlow.s.sol \
///     --rpc-url base_sepolia --broadcast
///
///   # optional, once the market has been quiet for `cooldown` seconds:
///   OS_MARKET=0x... forge script script/OddsShiftFairFlow.s.sol \
///     --sig "finalize()" --rpc-url base_sepolia --broadcast
contract OddsShiftFairFlow is OddsShiftFlowBase {
    /// @dev Anchor of the whole demo: the probability before trade #0.
    uint64 internal p0;
    /// @dev How far above the anchor the detection window closes.
    uint64 internal over;
    /// @dev Where the four tail trades leave the probability, above the anchor.
    uint64 internal tailEnd;

    function run() external {
        _load();
        _reportParams();
        _requireDrained();

        IEventMarketV2.OddsShiftInfo memory before = m.getOddsShiftInfo();
        _plan(before);

        vm.startBroadcast(pk);
        _prepare();
        _climb(before.lookback);
        _correct();
        _tail(before.lookback);
        console.log("");
        console.log("--- claiming ---");
        _claimRebate();
        vm.stopBroadcast();

        console.log("");
        _verify(before);
        _report();
        _tradeTable();
        _epilogue();
    }

    /// @notice `resolveStale()` for whatever this flow left pending. Safe here:
    ///         the tail sits well inside the jump threshold, so the leftovers
    ///         are refunded too.
    function finalize() external {
        _finalizeQueue();
    }

    /*//////////////////////////////////////////////////////////////
                                 PLAN
    //////////////////////////////////////////////////////////////*/

    /// @dev Solve the three probabilities the flow has to hit, and assert the
    ///      market's own parameters actually make the story come out fair.
    function _plan(IEventMarketV2.OddsShiftInfo memory i) internal {
        p0 = _prob();
        over = uint64(i.jumpThreshold) + 2 * POINT; // trips the window, with margin
        tailEnd = uint64(i.jumpThreshold) * 7 / 10; // lands between the two limits

        uint64 step = over / uint64(i.lookback);
        uint64 tailStep = tailEnd / (uint64(i.lookback) - 1);

        require(over > i.jumpThreshold, "climb would not trip the window");
        // The corrector's own window (#5..#9) must stay under the jump line, or
        // the corrector gets marked as a shock of its own.
        require(over - tailEnd < i.jumpThreshold, "the tail would re-trip on the corrector");
        // And so must the partial window `finalize()` would judge.
        require(tailEnd < i.jumpThreshold, "the tail would re-trip on resolveStale");
        require(tailStep <= i.contribThreshold, "tail trades would count as causes");
        require(uint256(p0) + over < PROB_ONE - 5 * POINT, "market is too close to 100%");

        console.log("--- plan ---");
        console.log(
            string.concat(
                "  ",
                vm.toString(uint256(i.lookback)),
                " buys of ",
                _signedPts(0, step),
                " pts -> mark at ",
                _pct(p0 + over),
                " (anchor ",
                _pct(p0),
                ")"
            )
        );
        console.log(string.concat("  1 counter-buy back to ", _pct(p0), " -> reverts the shock at once"));
        console.log(
            string.concat(
                "  ",
                vm.toString(uint256(i.lookback) - 1),
                " tail buys of ",
                _signedPts(0, tailStep),
                " pts -> retires the corrector, still under the jump line"
            )
        );
        console.log("");
        console.log("--- flow ---");
    }

    /*//////////////////////////////////////////////////////////////
                                 FLOW
    //////////////////////////////////////////////////////////////*/

    /// @dev `lookback` buys that add up to more than the jump threshold. Each
    ///      one is over the contribution line, so this is not a flow that hides
    ///      behind dust — it gets refunded because it came back, not because it
    ///      was small.
    function _climb(uint32 lookback) internal {
        for (uint256 j = 1; j <= lookback; ++j) {
            _tradeTo(p0 + uint64(uint256(over) * j / lookback), j == lookback ? "<- MARK: the window trips here" : "");
        }
    }

    function _correct() internal {
        _tradeTo(p0, "<- back to the anchor: the shock reverts, window refunded");
    }

    /// @dev `lookback - 1` small buys. Together with the corrector they make one
    ///      full window whose net displacement is under the jump line, so the
    ///      corrector retires clean instead of anchoring a shock of its own.
    function _tail(uint32 lookback) internal {
        for (uint256 j = 1; j < lookback; ++j) {
            _tradeTo(
                p0 + uint64(uint256(tailEnd) * j / (lookback - 1)),
                j == lookback - 1 ? "<- the corrector retires: RefundedNoShock" : ""
            );
        }
    }

    /*//////////////////////////////////////////////////////////////
                                VERIFY
    //////////////////////////////////////////////////////////////*/

    /// @dev A demo that quietly does the wrong thing is worse than one that
    ///      reverts, so the story is asserted rather than narrated.
    function _verify(IEventMarketV2.OddsShiftInfo memory before) internal view {
        IEventMarketV2.OddsShiftInfo memory after_ = m.getOddsShiftInfo();

        require(after_.totalShocks == before.totalShocks + 1, "expected exactly one new shock");
        IEventMarketV2.Shock memory s = m.getShocks(after_.totalShocks - 1, 1)[0];
        require(s.outcome == uint8(IEventMarketV2.ShockOutcome.Reverted), "shock did not revert - check the pool depth");
        require(after_.cumChargedFee == before.cumChargedFee, "something was charged");
        require(after_.cumRebated > before.cumRebated, "nothing was refunded");

        console.log("--- result: FAIR FLOW ---");
        console.log(
            string.concat(
                "  shock #",
                vm.toString(after_.totalShocks - 1),
                " marked at ",
                _pct(s.pShock),
                ", reverted at ",
                _pct(s.pEnd),
                " (anchor ",
                _pct(s.pAnchor),
                ")"
            )
        );
        console.log(
            string.concat("  refunded this run: ", _amt(after_.cumRebated - before.cumRebated), "   charged: 0")
        );
        console.log("");
    }

    function _epilogue() internal view {
        IEventMarketV2.OddsShiftInfo memory i = m.getOddsShiftInfo();
        console.log("--- next ---");
        console.log(string.concat("  page : /oddsshift/", vm.toString(address(m))));
        if (i.pendingCount > 0) {
            console.log(
                string.concat(
                    "  ",
                    vm.toString(i.pendingCount),
                    " small trades are still pending. After ",
                    vm.toString(uint256(i.cooldown)),
                    "s of quiet, --sig \"finalize()\" refunds them too."
                )
            );
        }
    }
}
