// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @title DeployMockUSDC
/// @notice Deploys the 6-decimal MockUSDC test token and optionally seeds the deployer.
/// @dev Set MINT_USDC (whole units) to mint an initial balance to the deployer. NOT for production.
contract DeployMockUSDC is Script {
    function run() external returns (MockUSDC usdc) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        uint256 mintWhole = vm.envOr("MINT_USDC", uint256(0));

        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        usdc = new MockUSDC();
        console.log("MockUSDC deployed at:", address(usdc));

        if (mintWhole > 0) {
            usdc.faucet(mintWhole);
            console.log("Minted USDC (whole):", mintWhole, "to:", deployer);
        }

        vm.stopBroadcast();
    }
}
