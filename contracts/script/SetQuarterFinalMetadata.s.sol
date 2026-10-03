// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {EventMarket} from "../src/EventMarket.sol";
import {IEventMarket} from "../src/interfaces/IEventMarket.sol";

/// @title SetQuarterFinalMetadata
/// @notice Rewrites the question + resolutionSource of the four ALREADY-DEPLOYED
///         2026 World Cup quarter-final markets to the new format, in place, via
///         EventMarket.setMetadata — no redeploy, so the existing addresses (and
///         all bets / liquidity) are preserved.
///
///         New question:  "{homeFlag} {Home} vs {awayFlag} {Away}/{Home} win"
///         New resolution: "FIFA official full-time result (admin-reported).
///                          YES = {Home} win the quarter-final (incl. extra time /
///                          penalties); NO = {Away} win."
///
///         The correct four addresses are chosen automatically from block.chainid
///         (base-sepolia 84532, arc-testnet 5042002, bsc-testnet 97). Run once per
///         chain with that chain's RPC. The deployer must be each market's admin.
///
/// Env:
///   PRIVATE_KEY - admin private key (must match every market's admin())
///
/// Example:
///   PRIVATE_KEY=0x... forge script script/SetQuarterFinalMetadata.s.sol \
///     --rpc-url $RPC_URL --broadcast
contract SetQuarterFinalMetadata is Script {
    uint256 internal constant N = 4;

    function run() external {
        uint256 adminKey = vm.envUint("PRIVATE_KEY");
        address admin = vm.addr(adminKey);

        // Same order everywhere: France/Morocco, Spain/Belgium, Norway/England,
        // Argentina/Switzerland — matching CreateQuarterFinalMarkets.s.sol.
        string[] memory home = new string[](N);
        string[] memory away = new string[](N);
        string[] memory homeFlag = new string[](N);
        string[] memory awayFlag = new string[](N);

        home[0] = "France";
        away[0] = "Morocco";
        homeFlag[0] = unicode"🇫🇷";
        awayFlag[0] = unicode"🇲🇦";

        home[1] = "Spain";
        away[1] = "Belgium";
        homeFlag[1] = unicode"🇪🇸";
        awayFlag[1] = unicode"🇧🇪";

        home[2] = "Norway";
        away[2] = "England";
        homeFlag[2] = unicode"🇳🇴";
        awayFlag[2] = unicode"🏴󠁧󠁢󠁥󠁮󠁧󠁿";

        home[3] = "Argentina";
        away[3] = "Switzerland";
        homeFlag[3] = unicode"🇦🇷";
        awayFlag[3] = unicode"🇨🇭";

        address[] memory markets = marketsForChain();

        console.log("chainid:", block.chainid);
        console.log("admin:  ", admin);

        vm.startBroadcast(adminKey);

        for (uint256 i = 0; i < N; i++) {
            EventMarket market = EventMarket(markets[i]);

            IEventMarket.MarketInfo memory info = market.getMarketInfo();
            require(info.admin == admin, "PRIVATE_KEY is not this market's admin");
            require(info.status != IEventMarket.Status.Settled, "market already settled");

            string memory question =
                string.concat(homeFlag[i], " ", home[i], " vs ", awayFlag[i], " ", away[i], "/", home[i], " win");
            string memory resolutionSource = string.concat(
                "FIFA official full-time result (admin-reported). YES = ",
                home[i],
                " win the quarter-final (incl. extra time / penalties); NO = ",
                away[i],
                " win."
            );

            market.setMetadata(question, resolutionSource);

            console.log(string.concat(home[i], " vs ", away[i]));
            console.log("  market ", markets[i]);
            console.log("  question:        ", question);
            console.log("  resolutionSource:", resolutionSource);
        }

        vm.stopBroadcast();

        console.log("Done. Updated", N, "quarter-final markets.");
    }

    /// @dev The four QF market addresses for the current chain, in the fixed order
    ///      France/Morocco, Spain/Belgium, Norway/England, Argentina/Switzerland.
    ///      Mirrors bot/config/event-market-deployments.ts and
    ///      webapp/src/data/worldCupKnockout.ts.
    function marketsForChain() internal view returns (address[] memory markets) {
        markets = new address[](N);

        if (block.chainid == 84532) {
            // Base Sepolia
            markets[0] = 0x5D8F2286233Eb1007273b2F2B5a2079392AAe8C8;
            markets[1] = 0x9DbfBa1cf143A0cD33fC5059b995A808c3A732A9;
            markets[2] = 0xAD11FaEE1bc796b9f2eFBbfa534855B0ad915f02;
            markets[3] = 0x42d6F88f0De369bcDD27E482b923998Ced3a11F6;
        } else if (block.chainid == 5042002) {
            // Arc Testnet
            markets[0] = 0x054dEe729F89de32E4150244f1B0268ceAeED8e2;
            markets[1] = 0x260dEae0dbEfb7D220887D087891fE5cF7a1d4a4;
            markets[2] = 0x727c36c3b4dc15AFdEd68b8f171Ca79E548E781d;
            markets[3] = 0x56EDCA2E1878B3eE0097bF2d8F7B818861D5cf68;
        } else if (block.chainid == 97) {
            // BSC Testnet
            markets[0] = 0x895B41471b70e450CE6319082e40EA5c118b0438;
            markets[1] = 0x864e488AF61D2fEE85465Aa6C7b7dbF5978C4D7F;
            markets[2] = 0x842bf3DF3744144a648CFe2c386Ec55DD89BAa97;
            markets[3] = 0x4f396014C1971074eDBFeF479aa7B07ce6eD9e57;
        } else {
            revert("unsupported chainid: add the QF addresses for this chain");
        }
    }
}
