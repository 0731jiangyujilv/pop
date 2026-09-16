// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IBetFactory - Interface for the Bet Factory contract
/// @notice Defines the external interface for creating and managing multi-side bets
interface IBetFactory {
    event BetCreated(
        uint256 indexed betId,
        address betContract,
        address indexed creator,
        address token,
        string asset
    );

    error InvalidAmount();
    error InvalidDuration();
    error UnsupportedAsset();
    error InvalidToken();

    function createBet(
        address token,
        uint256 minAmount,
        uint256 maxAmount,
        uint256 duration,
        string calldata asset,
        uint8 initiatorSide,
        uint256 initiatorAmount
    ) external returns (uint256 betId, address betContract);

    function getBet(uint256 betId) external view returns (address);
    function getBetCount() external view returns (uint256);
    function getPriceFeed(string calldata asset) external view returns (address);
}
