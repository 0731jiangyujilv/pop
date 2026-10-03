// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {BetPoR} from "../src/BetPoR.sol";

contract BetPoRTest is Test {
    BetPoR public por;
    address public owner;
    address public forwarder;
    address public user;

    function setUp() public {
        owner = address(this);
        forwarder = makeAddr("forwarder");
        user = makeAddr("user");
        por = new BetPoR(forwarder);
    }

    function test_InitialState() public view {
        assertEq(por.reportCount(), 0);
        assertEq(por.owner(), owner);
        assertEq(por.getForwarderAddress(), forwarder);
    }

    function test_OnReport() public {
        bytes memory metadata = abi.encodePacked(
            bytes32(uint256(1)),
            bytes10("workflow"),
            address(this)
        );
        
        bytes memory report = abi.encode(
            uint256(100),
            uint256(10),
            uint256(90),
            uint256(1e18),
            uint256(0.5e18),
            true,
            block.timestamp
        );

        vm.prank(forwarder);
        por.onReport(metadata, report);

        assertEq(por.reportCount(), 1);
        
        BetPoR.Report memory storedReport = por.getLatestReport();
        assertEq(storedReport.totalBets, 100);
        assertEq(storedReport.activeBets, 10);
        assertEq(storedReport.settledBets, 90);
        assertEq(storedReport.totalVolume, 1e18);
        assertEq(storedReport.topPlayerProfit, 0.5e18);
        assertTrue(storedReport.isValid);
        assertEq(storedReport.timestamp, block.timestamp);
    }

    function test_RevertWhen_NonForwarderCallsOnReport() public {
        bytes memory metadata = abi.encodePacked(
            bytes32(uint256(1)),
            bytes10("workflow"),
            address(this)
        );
        
        bytes memory report = abi.encode(
            uint256(100),
            uint256(10),
            uint256(90),
            uint256(1e18),
            uint256(0.5e18),
            true,
            block.timestamp
        );

        vm.prank(user);
        vm.expectRevert();
        por.onReport(metadata, report);
    }

    function test_GetReportById() public {
        bytes memory metadata = abi.encodePacked(
            bytes32(uint256(1)),
            bytes10("workflow"),
            address(this)
        );
        
        bytes memory report1 = abi.encode(uint256(100), uint256(10), uint256(90), uint256(1e18), uint256(0.5e18), true, block.timestamp);
        bytes memory report2 = abi.encode(uint256(200), uint256(20), uint256(180), uint256(2e18), uint256(1e18), true, block.timestamp + 1);
        
        vm.startPrank(forwarder);
        por.onReport(metadata, report1);
        por.onReport(metadata, report2);
        vm.stopPrank();

        BetPoR.Report memory storedReport1 = por.getReport(1);
        assertEq(storedReport1.totalBets, 100);

        BetPoR.Report memory storedReport2 = por.getReport(2);
        assertEq(storedReport2.totalBets, 200);
    }

    function test_RevertWhen_InvalidReportId() public {
        vm.expectRevert("Invalid report ID");
        por.getReport(1);

        bytes memory metadata = abi.encodePacked(bytes32(uint256(1)), bytes10("workflow"), address(this));
        bytes memory report = abi.encode(uint256(100), uint256(10), uint256(90), uint256(1e18), uint256(0.5e18), true, block.timestamp);
        
        vm.prank(forwarder);
        por.onReport(metadata, report);

        vm.expectRevert("Invalid report ID");
        por.getReport(0);

        vm.expectRevert("Invalid report ID");
        por.getReport(2);
    }

    function test_MultipleReportsUpdateLatest() public {
        bytes memory metadata = abi.encodePacked(bytes32(uint256(1)), bytes10("workflow"), address(this));
        bytes memory report1 = abi.encode(uint256(100), uint256(10), uint256(90), uint256(1e18), uint256(0.5e18), true, block.timestamp);
        bytes memory report2 = abi.encode(uint256(200), uint256(20), uint256(180), uint256(2e18), uint256(1e18), false, block.timestamp + 1);
        
        vm.startPrank(forwarder);
        por.onReport(metadata, report1);
        
        BetPoR.Report memory latest = por.getLatestReport();
        assertEq(latest.totalBets, 100);

        por.onReport(metadata, report2);
        
        latest = por.getLatestReport();
        assertEq(latest.totalBets, 200);
        assertFalse(latest.isValid);
        vm.stopPrank();
    }

    function test_EmitReportSubmittedEvent() public {
        bytes memory metadata = abi.encodePacked(bytes32(uint256(1)), bytes10("workflow"), address(this));
        bytes memory report = abi.encode(uint256(100), uint256(10), uint256(90), uint256(1e18), uint256(0.5e18), true, block.timestamp);
        
        vm.expectEmit(true, false, false, true);
        emit BetPoR.ReportSubmitted(1, 100, 10, 90, 1e18, 0.5e18, true, block.timestamp);
        
        vm.prank(forwarder);
        por.onReport(metadata, report);
    }

    // Interface support test removed - not applicable for this contract
}
