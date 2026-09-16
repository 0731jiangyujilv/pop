// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IEventBet - Interface for YES/NO binary event bet contracts
/// @notice Defines the external interface for a multi-player team-based event bet
interface IEventBet {
    enum EventBetStatus {
        Open,
        Closed,
        Settled
    }

    enum Side {
        Yes,
        No
    }

    enum Outcome {
        Unresolved,
        Yes,
        No
    }

    struct Position {
        address player;
        uint256 amount;
    }

    struct EventBetInfo {
        address creator;
        address token;
        uint256 minAmount;
        uint256 maxAmount;
        uint256 closingTime;
        uint256 bettingDeadline;
        EventBetStatus status;
        Outcome outcome;
        Side winningSide;
        bool isDraw;
        uint256 totalYes;
        uint256 totalNo;
        uint256 prizePool;
        uint256 feeBps;
        address feeRecipient;
    }

    event BetPlaced(address indexed player, Side side, uint256 amount);
    event BetClosed(uint256 closingTime);
    event EventResolved(Outcome outcome, string reasoning);
    event Claimed(address indexed player, uint256 payout);
    event EmergencyWithdraw(address indexed player, uint256 amount);
    event FeesCollected(address indexed recipient, uint256 amount);

    error InvalidStatus();
    error BettingClosed();
    error AlreadyPlaced();
    error AmountTooLow();
    error AmountTooHigh();
    error EventNotClosed();
    error NothingToClaim();
    error AlreadyClaimed();
    error NotAPlayer();
    error TimelockNotExpired();
    error InvalidFee();
    error BettingNotClosed();
    error InvalidSide();
    error InvalidInitialBet();
    error InvalidOutcome();
    error OnlyFactory();
    error OnlyAdmin();
    error SecondBetMustOpposeInitiator();
    error SecondBetAmountTooLow();

    function placeBet(Side side, uint256 amount) external;
    function initializeCreatorBet(address player, Side side, uint256 amount) external;
    function close() external;
    function resolve(uint8 outcome, string calldata reasoning) external;
    function claim() external;
    function claimFor(address player) external;
    function emergencyWithdraw() external;
    function question() external view returns (string memory);
    function resolutionSource() external view returns (string memory);
    function getEventBetInfo() external view returns (EventBetInfo memory);
    function getYesPositions() external view returns (Position[] memory);
    function getNoPositions() external view returns (Position[] memory);
}
