// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EventMarket} from "./EventMarket.sol";

/// @title EventMarketFactory - Deploys EventMarket instances and bootstraps them
/// @notice Only the owner (operator) may create markets, since each market
///         designates the factory owner as the admin/resolver. End users get
///         to LP, trade, and redeem on the deployed market — they don't create
///         their own admin-resolved markets through this factory.
contract EventMarketFactory is Ownable {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                STATE
    //////////////////////////////////////////////////////////////*/

    address public usdc;
    address public platform;

    uint256 public lpSwapFeeBps = 100;     // 1%
    uint256 public platformFeeBps = 70;    // 0.7% of totalCollateral at settle
    uint256 public creatorFeeBps = 30;     // 0.3% of totalCollateral at settle

    uint256 public nextMarketId;
    mapping(uint256 => address) public markets;

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event MarketCreated(
        uint256 indexed marketId,
        address indexed market,
        address indexed creator,
        string question,
        uint256 bettingDeadline,
        uint256 resolveAfter,
        uint256 initLiquidity
    );
    event ConfigUpdated(address usdc, address platform);
    event FeesUpdated(uint256 lpSwapFeeBps, uint256 platformFeeBps, uint256 creatorFeeBps);

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/

    error UsdcNotSet();
    error PlatformNotSet();
    error ZeroAmount();
    error InvalidDeadline();

    constructor(address _usdc, address _platform) Ownable(msg.sender) {
        usdc = _usdc;
        platform = _platform;
    }

    /*//////////////////////////////////////////////////////////////
                          MARKET CREATION
    //////////////////////////////////////////////////////////////*/

    struct CreateParams {
        string question;
        string resolutionSource;
        uint256 bettingDeadline;
        uint256 resolveAfter;
        uint256 initLiquidity;
    }

    /// @notice Deploy a new market, transfer the creator's seed liquidity in,
    ///         and bootstrap (half LP + half buy in the chosen direction).
    /// @dev    Caller must `approve` the factory for `initLiquidity` USDC first.
    ///         msg.sender is the creator; factory owner is the admin/resolver.
    function createMarket(CreateParams calldata p)
        external
        onlyOwner
        returns (uint256 marketId, address market)
    {
        if (usdc == address(0)) revert UsdcNotSet();
        if (platform == address(0)) revert PlatformNotSet();
        if (p.initLiquidity == 0) revert ZeroAmount();
        if (p.bettingDeadline <= block.timestamp) revert InvalidDeadline();

        marketId = nextMarketId++;

        EventMarket m = new EventMarket(
            EventMarket.Params({
                usdc: usdc,
                admin: owner(),
                creator: msg.sender,
                platform: platform,
                question: p.question,
                resolutionSource: p.resolutionSource,
                bettingDeadline: p.bettingDeadline,
                resolveAfter: p.resolveAfter,
                lpSwapFeeBps: lpSwapFeeBps,
                platformFeeBps: platformFeeBps,
                creatorFeeBps: creatorFeeBps
            })
        );
        market = address(m);
        markets[marketId] = market;

        IERC20(usdc).safeTransferFrom(msg.sender, market, p.initLiquidity);
        m.initializeMarket(msg.sender, p.initLiquidity);

        emit MarketCreated(
            marketId,
            market,
            msg.sender,
            p.question,
            m.bettingDeadline(),
            m.resolveAfter(), // effective value: defaults to bettingDeadline + 2h when 0 is passed
            p.initLiquidity
        );
    }

    function getMarket(uint256 marketId) external view returns (address) {
        return markets[marketId];
    }

    function marketCount() external view returns (uint256) {
        return nextMarketId;
    }

    /*//////////////////////////////////////////////////////////////
                            ADMIN CONFIG
    //////////////////////////////////////////////////////////////*/

    function setConfig(address _usdc, address _platform) external onlyOwner {
        usdc = _usdc;
        platform = _platform;
        emit ConfigUpdated(_usdc, _platform);
    }

    /// @dev EventMarket re-validates fees on each deploy; this just changes the
    ///      defaults used for future deployments.
    function setFees(uint256 _lpSwapFeeBps, uint256 _platformFeeBps, uint256 _creatorFeeBps)
        external
        onlyOwner
    {
        lpSwapFeeBps = _lpSwapFeeBps;
        platformFeeBps = _platformFeeBps;
        creatorFeeBps = _creatorFeeBps;
        emit FeesUpdated(_lpSwapFeeBps, _platformFeeBps, _creatorFeeBps);
    }
}
