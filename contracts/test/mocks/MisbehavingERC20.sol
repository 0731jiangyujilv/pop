// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockERC20} from "./MockERC20.sol";

/// @title MisbehavingERC20 - Test token whose transfers can fail silently or re-enter
/// @notice `returnFalse` makes transfer/transferFrom return false without moving
///         funds. `setReentry` makes the next transfer call back into `target`
///         before moving funds, bubbling any revert.
contract MisbehavingERC20 is MockERC20 {
    bool public returnFalse;
    address public reentryTarget;
    bytes public reentryData;

    constructor() MockERC20("Misbehaving test dollar", "MISB", 6) {}

    function setReturnFalse(bool value) external {
        returnFalse = value;
    }

    function setReentry(address target, bytes calldata data) external {
        reentryTarget = target;
        reentryData = data;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (returnFalse) return false;
        _reenter();
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (returnFalse) return false;
        _reenter();
        return super.transferFrom(from, to, amount);
    }

    function _reenter() private {
        address target = reentryTarget;
        if (target == address(0)) return;
        reentryTarget = address(0);
        (bool ok, bytes memory ret) = target.call(reentryData);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }
}
