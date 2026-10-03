// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RobinhoodDeploymentPreflight} from "../src/deployment/RobinhoodDeploymentPreflight.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract PreflightHarness {
    function validate(address token, address deployer, address feeRecipient, uint256 initialLiquidity) external view {
        RobinhoodDeploymentPreflight.validate(token, deployer, feeRecipient, initialLiquidity);
    }
}

contract RobinhoodDeploymentPreflightTest is Test {
    PreflightHarness internal harness;
    MockERC20 internal usdg;
    address internal deployer = makeAddr("deployer");
    address internal feeRecipient = makeAddr("feeRecipient");

    function setUp() public {
        vm.chainId(46_630);
        harness = new PreflightHarness();
        usdg = new MockERC20("Global Dollar", "USDG", 6);
        usdg.mint(deployer, 100e6);
        vm.deal(deployer, 1 ether);
    }

    function test_AcceptsFundedOfficialMetadata() public view {
        harness.validate(address(usdg), deployer, feeRecipient, 100e6);
    }

    function test_RevertsOnWrongChain() public {
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(RobinhoodDeploymentPreflight.WrongChain.selector, 1));
        harness.validate(address(usdg), deployer, feeRecipient, 100e6);
    }

    function test_RevertsOnZeroToken() public {
        vm.expectRevert(RobinhoodDeploymentPreflight.ZeroCollateral.selector);
        harness.validate(address(0), deployer, feeRecipient, 100e6);
    }

    function test_RevertsOnTokenWithoutCode() public {
        address notAContract = makeAddr("notAContract");
        vm.expectRevert(abi.encodeWithSelector(RobinhoodDeploymentPreflight.CollateralHasNoCode.selector, notAContract));
        harness.validate(notAContract, deployer, feeRecipient, 100e6);
    }

    function test_RevertsOnIncorrectSymbol() public {
        MockERC20 wrong = new MockERC20("USD Coin", "USDC", 6);
        vm.expectRevert(abi.encodeWithSelector(RobinhoodDeploymentPreflight.WrongCollateralSymbol.selector, "USDC"));
        harness.validate(address(wrong), deployer, feeRecipient, 100e6);
    }

    function test_RevertsOnUnsupportedDecimals() public {
        MockERC20 wrong = new MockERC20("Global Dollar", "USDG", 18);
        vm.expectRevert(
            abi.encodeWithSelector(RobinhoodDeploymentPreflight.UnsupportedCollateralDecimals.selector, uint8(18))
        );
        harness.validate(address(wrong), deployer, feeRecipient, 100e6);
    }

    function test_RevertsOnInsufficientDeploymentBalance() public {
        vm.expectRevert(
            abi.encodeWithSelector(RobinhoodDeploymentPreflight.InsufficientUsdGBalance.selector, 100e6, 101e6)
        );
        harness.validate(address(usdg), deployer, feeRecipient, 101e6);
    }

    function test_RevertsOnZeroFeeRecipient() public {
        vm.expectRevert(RobinhoodDeploymentPreflight.ZeroFeeRecipient.selector);
        harness.validate(address(usdg), deployer, address(0), 100e6);
    }

    function test_RevertsOnZeroInitialLiquidity() public {
        vm.expectRevert(RobinhoodDeploymentPreflight.ZeroInitialLiquidity.selector);
        harness.validate(address(usdg), deployer, feeRecipient, 0);
    }

    function test_RevertsOnInsufficientGasBalance() public {
        vm.deal(deployer, 0);
        vm.expectRevert(RobinhoodDeploymentPreflight.InsufficientGasBalance.selector);
        harness.validate(address(usdg), deployer, feeRecipient, 100e6);
    }
}
