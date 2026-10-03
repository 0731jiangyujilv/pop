// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EventMarketV2} from "../src/EventMarketV2.sol";
import {RobinhoodDeploymentPreflight} from "../src/deployment/RobinhoodDeploymentPreflight.sol";
import {DeployRobinhoodEventMarketV2} from "../script/DeployRobinhoodEventMarketV2.s.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice Runs the Robinhood deployment script in the local test EVM to prove
///         it applies the preflight before deploying. Nothing is broadcast: the
///         collateral at the official USDG address is a local MockERC20 test
///         double, and the deployer key is synthetic and never funded anywhere.
///
/// @dev The script reads its inputs from the process environment, which tests
///      running in parallel share. Every test therefore sets identical values
///      and varies only chain ID, account balances, or the code etched at the
///      official address.
contract DeployRobinhoodEventMarketV2Test is Test {
    address internal constant OFFICIAL_USDG = 0x7E955252E15c84f5768B83c41a71F9eba181802F;
    uint256 internal constant ROBINHOOD_TESTNET_CHAIN_ID = 46_630;
    uint256 internal constant DEPLOYER_PK = 0xD3B10;
    uint256 internal constant INIT_LIQUIDITY = 100_000_000;
    uint256 internal constant EIP170_RUNTIME_LIMIT = 24_576;

    DeployRobinhoodEventMarketV2 internal script;
    address internal deployer;
    address internal feeRecipient = makeAddr("robinhoodFeeRecipient");

    function setUp() public {
        deployer = vm.addr(DEPLOYER_PK);
        vm.setEnv("PRIVATE_KEY", vm.toString(DEPLOYER_PK));
        vm.setEnv("USDG_ADDRESS", vm.toString(OFFICIAL_USDG));
        vm.setEnv("FEE_RECIPIENT", vm.toString(feeRecipient));
        vm.setEnv("OS_INIT_LIQUIDITY", vm.toString(INIT_LIQUIDITY));

        vm.chainId(ROBINHOOD_TESTNET_CHAIN_ID);
        vm.deal(deployer, 1 ether);
        script = new DeployRobinhoodEventMarketV2();
    }

    function test_DeploysAgainstOfficialUsdgOnRobinhoodTestnet() public {
        _installCollateral("USDG", 6);

        EventMarketV2 market = EventMarketV2(script.run());

        assertEq(address(market.usdc()), OFFICIAL_USDG, "collateral is the official USDG address");
        assertEq(market.factory(), deployer);
        assertEq(market.admin(), deployer);
        assertEq(market.creator(), deployer);
        assertEq(market.platform(), feeRecipient);
        assertEq(market.lpSwapFeeBps(), 0);
        assertEq(market.totalCollateral(), INIT_LIQUIDITY);
        assertEq(market.lockedLpShares(deployer), INIT_LIQUIDITY);
        assertEq(MockERC20(OFFICIAL_USDG).balanceOf(address(market)), INIT_LIQUIDITY);
        assertLe(address(market).code.length, EIP170_RUNTIME_LIMIT, "runtime fits EIP-170");
    }

    function test_RefusesWrongChain() public {
        _installCollateral("USDG", 6);
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(RobinhoodDeploymentPreflight.WrongChain.selector, 1));
        script.run();
    }

    function test_RefusesOfficialAddressWithoutCode() public {
        vm.expectRevert(
            abi.encodeWithSelector(RobinhoodDeploymentPreflight.CollateralHasNoCode.selector, OFFICIAL_USDG)
        );
        script.run();
    }

    function test_RefusesNonUsdgTokenAtOfficialAddress() public {
        _installCollateral("USDC", 6);
        vm.expectRevert(abi.encodeWithSelector(RobinhoodDeploymentPreflight.WrongCollateralSymbol.selector, "USDC"));
        script.run();
    }

    function test_RefusesWrongDecimals() public {
        _installCollateral("USDG", 18);
        vm.expectRevert(
            abi.encodeWithSelector(RobinhoodDeploymentPreflight.UnsupportedCollateralDecimals.selector, uint8(18))
        );
        script.run();
    }

    function test_RefusesUnfundedLiquidity() public {
        _installCollateral("USDG", 6);
        vm.prank(deployer);
        MockERC20(OFFICIAL_USDG).transfer(feeRecipient, 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                RobinhoodDeploymentPreflight.InsufficientUsdGBalance.selector, INIT_LIQUIDITY - 1, INIT_LIQUIDITY
            )
        );
        script.run();
    }

    function test_RefusesZeroGasBalance() public {
        _installCollateral("USDG", 6);
        vm.deal(deployer, 0);
        vm.expectRevert(RobinhoodDeploymentPreflight.InsufficientGasBalance.selector);
        script.run();
    }

    function _installCollateral(string memory symbol, uint8 decimals) internal {
        deployCodeTo("MockERC20.sol:MockERC20", abi.encode("Local USDG test double", symbol, decimals), OFFICIAL_USDG);
        MockERC20(OFFICIAL_USDG).mint(deployer, INIT_LIQUIDITY);
    }
}
