// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice ERC-20 outcome token for a single side (YES or NO) of one prediction market.
/// Only the PredictionHook that deployed it can mint and burn.
contract OutcomeTokenV4 is ERC20 {
    address public immutable market;

    error OnlyMarket();

    constructor(string memory name_, string memory symbol_, address market_) ERC20(name_, symbol_) {
        market = market_;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != market) revert OnlyMarket();
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        if (msg.sender != market) revert OnlyMarket();
        _burn(from, amount);
    }
}
