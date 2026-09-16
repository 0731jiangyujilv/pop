// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EventMarketV2} from "../src/EventMarketV2.sol";

/// @title DeployEventMarketV2
/// @notice Deploys the single OddsShift demo market the /oddsshift page points
///         at. One run, one address to paste.
///
/// @dev There is deliberately no factory. EventMarketV2's initcode is ~24.4KB,
///      so any contract that deploys it with `new` carries that as runtime code
///      and lands past the EIP-170 24576-byte limit — even a factory with no
///      logic of its own. The deployer therefore takes the factory role
///      directly: whoever runs `new EventMarketV2` is recorded as `factory` and
///      is the only address that may call `initializeMarket`, once. The demo
///      needs exactly one market, so this costs nothing.
///
/// Required env (contracts/.env):
///   PRIVATE_KEY, USDC_ADDRESS, FEE_RECIPIENT
/// Optional env, with the demo defaults from oddsshift_todos.md section 2:
///   OS_INIT_LIQUIDITY      default 100000000  (100 USDC, 6 decimals)
///   OS_BASE_FEE_BPS        default 30         (0.30%, straight to LPs)
///   OS_PROTECTION_FEE_BPS  default 70         (0.70%, escrowed pending a verdict)
///   OS_JUMP_THRESHOLD      default 50000      (5 probability points, 1e6 scale)
///   OS_CONTRIB_THRESHOLD   default 10000      (1 probability point, 1e6 scale)
///   OS_LOOKBACK            default 5          (trades per detection window)
///   OS_OBSERVE_WINDOW      default 5          (trades a shock gets to revert)
///   OS_COOLDOWN            default 120        (seconds, resolveStale fallback)
///   OS_BETTING_HOURS       default 72         (hours from now)
///   OS_QUESTION            default "Will BTC close above $100k this week?"
contract DeployEventMarketV2 is Script {
    using SafeERC20 for IERC20;

    /// @dev Zero on purpose. OddsShift charges the whole 1% at the entry point, so
    ///      an extra in-curve swap fee would break the "reverted flow costs exactly
    ///      0.30%" promise the UI makes.
    uint256 constant LP_SWAP_FEE_BPS = 0;
    uint256 constant PLATFORM_FEE_BPS = 70; // 0.7% of totalCollateral at settle
    uint256 constant CREATOR_FEE_BPS = 30; // 0.3% of totalCollateral at settle

    function run() external returns (address market) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        uint256 initLiquidity = vm.envOr("OS_INIT_LIQUIDITY", uint256(100_000_000));

        // Built in its own frame on purpose: eighteen live locals across a
        // seventeen-field `new` blows the IR stack.
        EventMarketV2.Params memory p = _params(deployer);

        vm.startBroadcast(pk);

        EventMarketV2 m = new EventMarketV2(p);
        market = address(m);

        // Seed liquidity: the market pulls nothing, the factory role pushes.
        IERC20(p.usdc).safeTransfer(market, initLiquidity);
        m.initializeMarket(deployer, initLiquidity);

        vm.stopBroadcast();

        console.log("");
        console.log("EventMarketV2:", market);
        console.log("  question           :", p.question);
        console.log("  initLiquidity      :", initLiquidity);
        console.log("  baseFeeBps         :", p.baseFeeBps);
        console.log("  protectionFeeBps   :", p.protectionFeeBps);
        console.log("  jumpThreshold      :", p.jumpThreshold);
        console.log("  contribThreshold   :", p.contribThreshold);
        console.log("  lookback           :", p.lookback);
        console.log("  observeWindow      :", p.observeWindow);
        console.log("  cooldown           :", p.cooldown);
        console.log("");
        console.log("Open the demo at /oddsshift/%s", market);
    }

    /// @dev `deployer` takes both the admin and the creator role, and — because
    ///      there is no factory — the factory role too, by virtue of being the
    ///      address that runs `new`.
    function _params(address deployer) internal view returns (EventMarketV2.Params memory p) {
        p.usdc = vm.envAddress("USDC_ADDRESS");
        p.admin = deployer; // resolves the market
        p.creator = deployer; // takes the creator fee and the seed LP shares
        p.platform = vm.envAddress("FEE_RECIPIENT");
        p.question = vm.envOr("OS_QUESTION", string("Will BTC close above $100k this week?"));
        p.resolutionSource = "admin";
        p.bettingDeadline = block.timestamp + vm.envOr("OS_BETTING_HOURS", uint256(72)) * 1 hours;
        p.resolveAfter = 0; // defaults to bettingDeadline + 2h
        p.lpSwapFeeBps = LP_SWAP_FEE_BPS;
        p.platformFeeBps = PLATFORM_FEE_BPS;
        p.creatorFeeBps = CREATOR_FEE_BPS;
        p.baseFeeBps = uint16(vm.envOr("OS_BASE_FEE_BPS", uint256(30)));
        p.protectionFeeBps = uint16(vm.envOr("OS_PROTECTION_FEE_BPS", uint256(70)));
        p.jumpThreshold = uint32(vm.envOr("OS_JUMP_THRESHOLD", uint256(50_000)));
        p.contribThreshold = uint32(vm.envOr("OS_CONTRIB_THRESHOLD", uint256(10_000)));
        p.lookback = uint32(vm.envOr("OS_LOOKBACK", uint256(5)));
        p.observeWindow = uint32(vm.envOr("OS_OBSERVE_WINDOW", uint256(5)));
        p.cooldown = uint32(vm.envOr("OS_COOLDOWN", uint256(120)));
    }
}
