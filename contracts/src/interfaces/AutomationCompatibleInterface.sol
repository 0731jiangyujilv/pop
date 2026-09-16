// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AutomationCompatibleInterface - Chainlink Automation interface
/// @notice Contracts must implement this to be compatible with Chainlink Automation
interface AutomationCompatibleInterface {
    /// @notice Called by Automation nodes to check if upkeep is needed
    /// @param checkData Arbitrary data passed from upkeep registration
    /// @return upkeepNeeded True if performUpkeep should be called
    /// @return performData Data to pass to performUpkeep
    function checkUpkeep(bytes calldata checkData) external returns (bool upkeepNeeded, bytes memory performData);

    /// @notice Called by Automation nodes when checkUpkeep returns true
    /// @param performData Data returned by checkUpkeep
    function performUpkeep(bytes calldata performData) external;
}
