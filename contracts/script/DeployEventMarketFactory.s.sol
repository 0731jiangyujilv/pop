// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {EventMarketFactory} from "../src/EventMarketFactory.sol";

/// @title DeployEventMarketFactory
/// @notice Deploys EventMarketFactory. Default fees: 1% LP swap + 0.7% platform
///         + 0.3% creator (total 1% protocol fee at settlement).
contract DeployEventMarketFactory is Script {
    function run() external returns (EventMarketFactory factory) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        address platform = vm.envAddress("FEE_RECIPIENT");

        vm.startBroadcast(deployerPrivateKey);

        factory = new EventMarketFactory(usdcAddress, platform);
        console.log("EventMarketFactory deployed at:", address(factory));
        console.log("  usdc     =", usdcAddress);
        console.log("  platform =", platform);
        console.log("  lpSwapFeeBps   =", factory.lpSwapFeeBps());
        console.log("  platformFeeBps =", factory.platformFeeBps());
        console.log("  creatorFeeBps  =", factory.creatorFeeBps());

        vm.stopBroadcast();
    }
}
