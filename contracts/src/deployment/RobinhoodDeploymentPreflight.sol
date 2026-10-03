// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @notice Read-only gates shared by the Robinhood deployment script and tests.
library RobinhoodDeploymentPreflight {
    uint256 internal constant ROBINHOOD_TESTNET_CHAIN_ID = 46_630;
    uint8 internal constant USDG_DECIMALS = 6;
    address internal constant OFFICIAL_ROBINHOOD_USDG = 0x7E955252E15c84f5768B83c41a71F9eba181802F;

    error WrongChain(uint256 actual);
    error ZeroCollateral();
    error UnexpectedUsdGAddress(address actual);
    error CollateralHasNoCode(address collateral);
    error WrongCollateralSymbol(string actual);
    error UnsupportedCollateralDecimals(uint8 actual);
    error ZeroFeeRecipient();
    error ZeroInitialLiquidity();
    error InsufficientUsdGBalance(uint256 available, uint256 required);
    error InsufficientGasBalance();

    function validate(address collateral, address deployer, address feeRecipient, uint256 initialLiquidity)
        internal
        view
    {
        if (block.chainid != ROBINHOOD_TESTNET_CHAIN_ID) revert WrongChain(block.chainid);
        if (collateral == address(0)) revert ZeroCollateral();
        if (collateral != OFFICIAL_ROBINHOOD_USDG) revert UnexpectedUsdGAddress(collateral);
        if (collateral.code.length == 0) revert CollateralHasNoCode(collateral);
        if (feeRecipient == address(0)) revert ZeroFeeRecipient();
        if (initialLiquidity == 0) revert ZeroInitialLiquidity();

        IERC20Metadata token = IERC20Metadata(collateral);
        string memory actualSymbol = token.symbol();
        if (keccak256(bytes(actualSymbol)) != keccak256("USDG")) {
            revert WrongCollateralSymbol(actualSymbol);
        }

        uint8 actualDecimals = token.decimals();
        if (actualDecimals != USDG_DECIMALS) revert UnsupportedCollateralDecimals(actualDecimals);

        uint256 balance = token.balanceOf(deployer);
        if (balance < initialLiquidity) {
            revert InsufficientUsdGBalance(balance, initialLiquidity);
        }
        if (deployer.balance == 0) revert InsufficientGasBalance();
    }
}
