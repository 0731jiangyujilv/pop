// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {EventMarket} from "../src/EventMarket.sol";
import {IEventMarket} from "../src/interfaces/IEventMarket.sol";

/// @title ResolveEventMarket
/// @notice Settles an EventMarket by calling resolve(yesWins, reasoning).
///         Must be called by the market's admin key after resolveAfter timestamp.
///
/// Required env vars:
///   PRIVATE_KEY          — admin private key (must match market.admin())
///   EVENT_MARKET_ADDRESS — address of the deployed EventMarket
///   YES_WINS             — 1 if YES wins, 0 if NO wins
///   REASONING            — human-readable settlement explanation
///
/// Example:
///   YES_WINS=1 REASONING="Mexico won 2-0" \
///   forge script script/ResolveEventMarket.s.sol \
///     --rpc-url $RPC_URL --broadcast
contract ResolveEventMarket is Script {
    function run() external {
        uint256 adminKey = vm.envUint("PRIVATE_KEY");
        address marketAddr = vm.envAddress("EVENT_MARKET_ADDRESS");
        bool yesWins = vm.envUint("YES_WINS") == 1;
        string memory reasoning = vm.envString("REASONING");

        require(marketAddr != address(0), "EVENT_MARKET_ADDRESS required");
        require(bytes(reasoning).length > 0, "REASONING required");

        EventMarket market = EventMarket(marketAddr);

        // --- Pre-flight checks ---
        IEventMarket.MarketInfo memory info = market.getMarketInfo();

        address callerAddr = vm.addr(adminKey);
        require(callerAddr == info.admin, "PRIVATE_KEY does not match market admin");
        require(
            info.status == IEventMarket.Status.Locked,
            info.status == IEventMarket.Status.Open
                ? "Market is still Open (bettingDeadline not reached yet)"
                : "Market is already Settled"
        );
        require(
            block.timestamp >= market.resolveAfter(),
            "resolveAfter timestamp not reached yet"
        );

        // --- Print state before settlement ---
        console.log("\n=== EventMarket Pre-Settlement State ===");
        console.log("market:          ", marketAddr);
        console.log("question:        ", info.question);
        console.log("resolutionSource:", info.resolutionSource);
        console.log("totalCollateral: ", info.totalCollateral);
        console.log("yesReserve:      ", info.yesReserve);
        console.log("noReserve:       ", info.noReserve);
        console.log("totalLpShares:   ", info.totalLpShares);
        console.log("platformFeeBps:  ", info.platformFeeBps);
        console.log("creatorFeeBps:   ", info.creatorFeeBps);

        // Estimate fee disbursements (off-chain preview)
        uint256 platformFee = info.totalCollateral * info.platformFeeBps / 10_000;
        uint256 creatorFee  = info.totalCollateral * info.creatorFeeBps / 10_000;
        uint256 remaining   = info.totalCollateral - platformFee - creatorFee;
        uint256 netPerToken = info.totalCollateral == 0
            ? 0
            : remaining * 1e18 / info.totalCollateral;

        console.log("\n--- Projected Fees ---");
        console.log("platformFee (USDC units):", platformFee);
        console.log("creatorFee  (USDC units):", creatorFee);
        console.log("netUsdcPerWinningToken (1e18-scaled):", netPerToken);
        console.log("Resolving YES_WINS =", yesWins ? "true" : "false");
        console.log("Reasoning:", reasoning);

        // --- Broadcast ---
        vm.startBroadcast(adminKey);
        market.resolve(yesWins, reasoning);
        vm.stopBroadcast();

        // --- Print post-settlement state ---
        IEventMarket.MarketInfo memory post = market.getMarketInfo();

        console.log("\n=== Settlement Complete ===");
        console.log("status:               Settled");
        console.log("yesWins:             ", post.yesWins ? "true" : "false");
        console.log("netUsdcPerYesToken:  ", post.netUsdcPerYesToken);
        console.log("netUsdcPerNoToken:   ", post.netUsdcPerNoToken);
        console.log("\n--- Redeem commands ---");
        if (post.yesWins) {
            console.log(unicode"Winners hold YES tokens — call redeemYes(amount) on:");
        } else {
            console.log(unicode"Winners hold NO tokens  — call redeemNo(amount) on:");
        }
        console.log("  ", marketAddr);
        console.log("LPs call claimLpPayout() on the same address.");
    }
}
