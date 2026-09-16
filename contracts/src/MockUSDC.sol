// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC - 6-decimal USDC mock for testnet / local use
/// @notice Freely mintable test token mirroring USDC's decimals. NOT for production.
contract MockUSDC is ERC20 {
    /// @dev USDC uses 6 decimals.
    uint8 private constant DECIMALS = 6;

    constructor() ERC20("USD Coin", "USDC") {}

    /// @notice Mint `amount` (in 6-decimal base units) to `to`. Open for testing.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Convenience faucet: mint `whole` USDC (whole units) to the caller.
    function faucet(uint256 whole) external {
        _mint(msg.sender, whole * 10 ** DECIMALS);
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }
}
