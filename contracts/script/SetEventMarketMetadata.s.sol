// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {EventMarket} from "../src/EventMarket.sol";
import {IEventMarket} from "../src/interfaces/IEventMarket.sol";

/// @title SetEventMarketMetadata
/// @notice Updates an EventMarket's question / resolutionSource via setMetadata().
///         Must be called by the market's admin key, and only while the market is
///         not yet Settled.
///
/// Required env vars:
///   PRIVATE_KEY          — admin private key (must match market.admin())
///   EVENT_MARKET_ADDRESS — address of the deployed EventMarket
///
/// Example:
///   EVENT_MARKET_ADDRESS=0x... \
///   forge script script/SetEventMarketMetadata.s.sol \
///     --rpc-url $RPC_URL --broadcast
contract SetEventMarketMetadata is Script {
    string internal constant NEW_QUESTION = unicode"🇩🇪 Germany to win World Cup 2026?";
    string internal constant NEW_RESOLUTION_SOURCE =
        "Resolves YES if Germany wins the 2026 FIFA World Cup Final. Otherwise resolves NO.";

    function run() external {
        uint256 adminKey = vm.envUint("PRIVATE_KEY");
        address marketAddr = vm.envAddress("EVENT_MARKET_ADDRESS");

        require(marketAddr != address(0), "EVENT_MARKET_ADDRESS required");

        EventMarket market = EventMarket(marketAddr);

        // --- Pre-flight checks ---
        IEventMarket.MarketInfo memory info = market.getMarketInfo();

        address callerAddr = vm.addr(adminKey);
        require(callerAddr == info.admin, "PRIVATE_KEY does not match market admin");
        require(info.status != IEventMarket.Status.Settled, "Market is already Settled");

        // --- Print state before update ---
        console.log("\n=== EventMarket Metadata (before) ===");
        console.log("market:          ", marketAddr);
        console.log("question:        ", info.question);
        console.log("resolutionSource:", info.resolutionSource);

        // --- Broadcast ---
        vm.startBroadcast(adminKey);
        market.setMetadata(NEW_QUESTION, NEW_RESOLUTION_SOURCE);
        vm.stopBroadcast();

        // --- Print state after update ---
        IEventMarket.MarketInfo memory post = market.getMarketInfo();

        console.log("\n=== EventMarket Metadata (after) ===");
        console.log("question:        ", post.question);
        console.log("resolutionSource:", post.resolutionSource);
    }
}
