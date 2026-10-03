// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EventMarketV2} from "../src/EventMarketV2.sol";
import {RobinhoodDeploymentPreflight} from "../src/deployment/RobinhoodDeploymentPreflight.sol";
import {DeployEventMarketV2} from "./DeployEventMarketV2.s.sol";

/// @title DeployRobinhoodEventMarketV2
/// @notice Robinhood Chain Testnet USDG deployment. Forge simulates unless the
///         caller separately and explicitly supplies `--broadcast`.
contract DeployRobinhoodEventMarketV2 is DeployEventMarketV2 {
    function _collateralToken() internal view override returns (address) {
        return vm.envAddress("USDG_ADDRESS");
    }

    function _preflight(address deployer, EventMarketV2.Params memory p, uint256 initLiquidity) internal view override {
        RobinhoodDeploymentPreflight.validate(p.usdc, deployer, p.platform, initLiquidity);
    }

    function _demoBasePath() internal pure override returns (string memory) {
        return "/robinhood/";
    }
}
