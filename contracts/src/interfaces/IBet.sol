// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IBet - Interface for multi-side price bet contracts
/// @notice Defines the external interface for a multi-player team-based price bet
interface IBet {
    enum BetStatus {
        Open,
        Locked,
        Settled,
        Expired
    }

    enum Side {
        Up,
        Down
    }

    struct Position {
        address player;
        uint256 amount;
    }

    struct BetInfo {
        address creator;
        address token;
        uint256 minAmount;
        uint256 maxAmount;
        uint256 duration;
        uint256 bettingDeadline;
        address priceFeed;
        int256 startPrice;
        int256 endPrice;
        uint256 startTime;
        uint256 endTime;
        BetStatus status;
        Side winningSide;
        bool isDraw;
        uint256 totalUp;
        uint256 totalDown;
        uint256 prizePool;
        uint256 feeBps;
        address feeRecipient;
    }

    event BetPlaced(address indexed player, Side side, uint256 amount);
    event BetLocked(int256 startPrice, uint256 startTime, uint256 endTime);
    event BetSettled(Side winningSide, bool isDraw, int256 endPrice);
    event BetExpired(uint256 refundedTotal);
    event Claimed(address indexed player, uint256 payout);
    event EmergencyWithdraw(address indexed player, uint256 amount);
    event FeesCollected(address indexed recipient, uint256 amount);
    error InvalidStatus();
    error BettingClosed();
    error AlreadyPlaced();
    error AmountTooLow();
    error AmountTooHigh();
    error BetNotExpired();
    error NothingToClaim();
    error AlreadyClaimed();
    error NotAPlayer();
    error OracleStalePrice();
    error OracleInvalidPrice();
    error TimelockNotExpired();
    error InvalidFee();
    error BettingNotClosed();
    error InvalidSide();
    error InvalidInitialBet();
    error OnlyFactory();
    error OnlyAdmin();
    error SecondBetMustOpposeInitiator();
    error SecondBetAmountTooLow();
    error LockRequiresBothSides();
    error BetContested();

    function placeBet(Side side, uint256 amount) external;
    function initializeAsset(string calldata asset_) external;
    function initializeCreatorBet(address player, Side side, uint256 amount) external;
    function lock() external;
    function settle() external;
    function expire() external;
    function claim() external;
    function claimFor(address player) external;
    function emergencyWithdraw() external;
    function asset() external view returns (string memory);
    function getBetInfo() external view returns (BetInfo memory);
    function getUpPositions() external view returns (Position[] memory);
    function getDownPositions() external view returns (Position[] memory);
}
