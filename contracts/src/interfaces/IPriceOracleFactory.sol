// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPriceOracleFactory - Minimal read interface used by BetFactory
/// @notice Only the asset → oracle lookup is needed for bet creation.
interface IPriceOracleFactory {
    function getOracle(string calldata asset) external view returns (address);
}
