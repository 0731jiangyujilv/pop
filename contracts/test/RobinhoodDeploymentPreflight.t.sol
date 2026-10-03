// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {RobinhoodDeploymentPreflight} from "../src/deployment/RobinhoodDeploymentPreflight.sol";

contract PreflightHarness {
    function validate(address token, address deployer, address feeRecipient, uint256 initialLiquidity) external view {
        RobinhoodDeploymentPreflight.validate(token, deployer, feeRecipient, initialLiquidity);
    }
}

contract RobinhoodDeploymentPreflightTest is Test {
    address internal constant USDG = 0x7E955252E15c84f5768B83c41a71F9eba181802F;
    PreflightHarness internal harness;
    address internal deployer = makeAddr("deployer");
    address internal feeRecipient = makeAddr("feeRecipient");

    function setUp() public {
        vm.chainId(46_630);
        harness = new PreflightHarness();
        vm.etch(USDG, hex"00");
        vm.mockCall(USDG, abi.encodeCall(IERC20Metadata.symbol, ()), abi.encode("USDG"));
        vm.mockCall(USDG, abi.encodeCall(IERC20Metadata.decimals, ()), abi.encode(uint8(6)));
        vm.mockCall(USDG, abi.encodeCall(IERC20.balanceOf, (deployer)), abi.encode(uint256(100e6)));
        vm.deal(deployer, 1 ether);
    }

    function test_AcceptsFundedOfficialMetadata() public view {
        harness.validate(USDG, deployer, feeRecipient, 100e6);
    }

    function test_RevertsOnWrongChain() public {
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(RobinhoodDeploymentPreflight.WrongChain.selector, 1));
        harness.validate(USDG, deployer, feeRecipient, 100e6);
    }

    function test_RevertsOnZeroToken() public {
        vm.expectRevert(RobinhoodDeploymentPreflight.ZeroCollateral.selector);
        harness.validate(address(0), deployer, feeRecipient, 100e6);
    }

    function test_RevertsOnUnexpectedTokenAddress() public {
        address wrong = makeAddr("wrong");
        vm.expectRevert(abi.encodeWithSelector(RobinhoodDeploymentPreflight.UnexpectedUsdGAddress.selector, wrong));
        harness.validate(wrong, deployer, feeRecipient, 100e6);
    }

    function test_RevertsWhenOfficialAddressHasNoCode() public {
        vm.etch(USDG, bytes(""));
        vm.expectRevert(abi.encodeWithSelector(RobinhoodDeploymentPreflight.CollateralHasNoCode.selector, USDG));
        harness.validate(USDG, deployer, feeRecipient, 100e6);
    }

    function test_RevertsOnIncorrectSymbol() public {
        vm.mockCall(USDG, abi.encodeCall(IERC20Metadata.symbol, ()), abi.encode("USDC"));
        vm.expectRevert(abi.encodeWithSelector(RobinhoodDeploymentPreflight.WrongCollateralSymbol.selector, "USDC"));
        harness.validate(USDG, deployer, feeRecipient, 100e6);
    }

    function test_RevertsOnUnsupportedDecimals() public {
        vm.mockCall(USDG, abi.encodeCall(IERC20Metadata.decimals, ()), abi.encode(uint8(18)));
        vm.expectRevert(
            abi.encodeWithSelector(RobinhoodDeploymentPreflight.UnsupportedCollateralDecimals.selector, uint8(18))
        );
        harness.validate(USDG, deployer, feeRecipient, 100e6);
    }

    function test_RevertsOnInsufficientDeploymentBalance() public {
        vm.mockCall(USDG, abi.encodeCall(IERC20.balanceOf, (deployer)), abi.encode(uint256(99e6)));
        vm.expectRevert(
            abi.encodeWithSelector(RobinhoodDeploymentPreflight.InsufficientUsdGBalance.selector, 99e6, 101e6)
        );
        harness.validate(USDG, deployer, feeRecipient, 101e6);
    }

    function test_RevertsOnZeroFeeRecipient() public {
        vm.expectRevert(RobinhoodDeploymentPreflight.ZeroFeeRecipient.selector);
        harness.validate(USDG, deployer, address(0), 100e6);
    }

    function test_RevertsOnZeroInitialLiquidity() public {
        vm.expectRevert(RobinhoodDeploymentPreflight.ZeroInitialLiquidity.selector);
        harness.validate(USDG, deployer, feeRecipient, 0);
    }

    function test_AcceptsMinimalPositiveGasBalance() public {
        vm.deal(deployer, 1);
        harness.validate(USDG, deployer, feeRecipient, 100e6);
    }

    function test_RevertsOnInsufficientGasBalance() public {
        vm.deal(deployer, 0);
        vm.expectRevert(RobinhoodDeploymentPreflight.InsufficientGasBalance.selector);
        harness.validate(USDG, deployer, feeRecipient, 100e6);
    }
}
