// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PredictionHook} from "./PredictionHook.sol";

/// @title PredictionHookHelper — One-step buyYes / buyNo
///
/// Flow for buyYes(marketId, usdcAmount, minYesOut):
///   1. Pull USDC from caller.
///   2. mintPairTo → helper receives usdcAmount YES + usdcAmount NO.
///   3. Swap ALL NO → YES through the V4 YES/NO pool (via poolManager.unlock).
///   4. Transfer (usdcAmount + swappedYes) YES to caller.
///
/// Flow for buyNo is symmetric: swap ALL YES → NO.
///
/// Settlement: does NOT need to go through the helper; users call hook.redeem() directly.
contract PredictionHookHelper is IUnlockCallback, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using BalanceDeltaLibrary for BalanceDelta;

    // Price limits for V4 swaps — use full range to never hit price limit.
    uint160 private constant MIN_SQRT_PRICE_LIMIT = 4295128740;           // MIN_SQRT_PRICE + 1
    uint160 private constant MAX_SQRT_PRICE_LIMIT = 1461446703485210103287273052203988822378723970341; // MAX_SQRT_PRICE - 1

    IPoolManager  public immutable poolManager;
    PredictionHook public immutable hook;
    IERC20         public immutable usdc;

    struct CallbackData {
        address user;
        uint256 marketId;
        bool    buyYesOut;  // true = swap NO→YES, false = swap YES→NO
        uint256 amountIn;   // amount of NO (or YES) to swap
    }

    error InsufficientOutput();
    error NotPoolManager();

    constructor(IPoolManager _poolManager, PredictionHook _hook, IERC20 _usdc) {
        poolManager  = _poolManager;
        hook         = _hook;
        usdc         = _usdc;
    }

    /*//////////////////////////////////////////////////////////////
                         ONE-STEP ENTRY POINTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Buy YES tokens in one transaction: deposit USDC, mintPair, swap NO→YES.
    /// @param marketId    Target market.
    /// @param usdcAmount  USDC to spend (must be approved to this contract).
    /// @param minYesOut   Minimum total YES tokens to receive (slippage guard).
    /// @return yesOut     Total YES tokens sent to caller.
    function buyYes(uint256 marketId, uint256 usdcAmount, uint256 minYesOut)
        external nonReentrant
        returns (uint256 yesOut)
    {
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        // Mint pair: helper receives usdcAmount YES + usdcAmount NO
        usdc.forceApprove(address(hook), usdcAmount);
        hook.mintPairTo(marketId, usdcAmount, address(this));

        (address yesToken, address noToken,) = hook.getMarketTokens(marketId);

        uint256 noBalance = IERC20(noToken).balanceOf(address(this));

        // Swap NO → YES via V4 pool
        _doSwap(marketId, noBalance, true);

        yesOut = IERC20(yesToken).balanceOf(address(this)); // initial YES + swapped YES
        if (yesOut < minYesOut) revert InsufficientOutput();

        IERC20(yesToken).safeTransfer(msg.sender, yesOut);
    }

    /// @notice Buy NO tokens in one transaction: deposit USDC, mintPair, swap YES→NO.
    /// @param marketId    Target market.
    /// @param usdcAmount  USDC to spend (must be approved to this contract).
    /// @param minNoOut    Minimum total NO tokens to receive (slippage guard).
    /// @return noOut      Total NO tokens sent to caller.
    function buyNo(uint256 marketId, uint256 usdcAmount, uint256 minNoOut)
        external nonReentrant
        returns (uint256 noOut)
    {
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        usdc.forceApprove(address(hook), usdcAmount);
        hook.mintPairTo(marketId, usdcAmount, address(this));

        (address yesToken, address noToken,) = hook.getMarketTokens(marketId);

        uint256 yesBalance = IERC20(yesToken).balanceOf(address(this));

        // Swap YES → NO via V4 pool
        _doSwap(marketId, yesBalance, false);

        noOut = IERC20(noToken).balanceOf(address(this));
        if (noOut < minNoOut) revert InsufficientOutput();

        IERC20(noToken).safeTransfer(msg.sender, noOut);
    }

    /*//////////////////////////////////////////////////////////////
                      V4 UNLOCK CALLBACK
    //////////////////////////////////////////////////////////////*/

    /// @dev Called by PoolManager during unlock. Performs swap + settlement.
    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();

        CallbackData memory d = abi.decode(data, (CallbackData));
        PoolKey memory key = hook.getPoolKey(d.marketId);
        (, address noToken,) = hook.getMarketTokens(d.marketId);

        // Determine swap direction: zeroForOne means we sell currency0.
        bool noIsZero   = Currency.unwrap(key.currency0) == noToken;
        bool zeroForOne = d.buyYesOut ? noIsZero : !noIsZero; // buyYes = sell NO; buyNo = sell YES

        IPoolManager.SwapParams memory params = IPoolManager.SwapParams({
            zeroForOne:        zeroForOne,
            amountSpecified:   int256(d.amountIn), // positive = exactInput
            sqrtPriceLimitX96: zeroForOne ? MIN_SQRT_PRICE_LIMIT : MAX_SQRT_PRICE_LIMIT
        });

        BalanceDelta delta = poolManager.swap(key, params, "");

        // Settle / take based on signed deltas:
        //   positive delta = pool owes us → take
        //   negative delta = we owe pool → settle (sync + transfer + settle)
        _settleDelta(key.currency0, delta.amount0());
        _settleDelta(key.currency1, delta.amount1());

        // unused return — caller reads balances directly
        return abi.encode(uint256(0));
    }

    /*//////////////////////////////////////////////////////////////
                            INTERNAL
    //////////////////////////////////////////////////////////////*/

    function _doSwap(uint256 marketId, uint256 amountIn, bool buyYesOut) internal {
        CallbackData memory d = CallbackData({
            user:       msg.sender,
            marketId:   marketId,
            buyYesOut:  buyYesOut,
            amountIn:   amountIn
        });
        poolManager.unlock(abi.encode(d));
    }

    function _settleDelta(Currency currency, int128 amount) internal {
        if (amount > 0) {
            // Pool owes us: take it
            poolManager.take(currency, address(this), uint128(amount));
        } else if (amount < 0) {
            // We owe pool: sync → transfer ERC-20 → settle
            poolManager.sync(currency);
            IERC20(Currency.unwrap(currency)).safeTransfer(address(poolManager), uint128(-amount));
            poolManager.settle();
        }
    }
}
