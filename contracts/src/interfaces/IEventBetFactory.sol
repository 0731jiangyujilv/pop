// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IEventBetFactory - Interface for the EventBet Factory contract
/// @notice Defines the external interface for creating and managing event bets
interface IEventBetFactory {
    event EventBetCreated(
        uint256 indexed betId,
        address betContract,
        address indexed creator,
        address token,
        string question
    );

    error InvalidAmount();
    error InvalidClosingTime();
    error InvalidToken();

    function createEventBet(
        address token,
        uint256 minAmount,
        uint256 maxAmount,
        uint256 closingTime,
        string calldata question,
        string calldata resolutionSource,
        uint8 initiatorSide,
        uint256 initiatorAmount
    ) external returns (uint256 betId, address betContract);

    function getEventBet(uint256 betId) external view returns (address);
    function getEventBetCount() external view returns (uint256);
}
