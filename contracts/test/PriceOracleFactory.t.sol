// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PriceOracleFactory} from "../src/PriceOracleFactory.sol";
import {PriceOracle} from "../src/PriceOracle.sol";

contract PriceOracleFactoryTest is Test {
    PriceOracleFactory public factory;

    address public owner = makeAddr("owner");
    address public reporter = makeAddr("reporter");
    address public alice = makeAddr("alice");

    function setUp() public {
        vm.prank(owner);
        factory = new PriceOracleFactory(owner);
    }

    function test_createOracle() public {
        vm.prank(owner);
        address oracle = factory.createOracle("BTC/USD", 8, "BTC oracle");

        assertTrue(oracle != address(0));
        assertEq(factory.getOracle("BTC/USD"), oracle);
        assertEq(factory.getOracleCount(), 1);

        PriceOracle priceOracle = PriceOracle(oracle);
        assertEq(priceOracle.owner(), address(factory));
        assertEq(priceOracle.decimals(), 8);
        assertEq(priceOracle.description(), "BTC oracle");
    }

    function test_listOracles() public {
        vm.startPrank(owner);
        factory.createOracle("BTC/USD", 8, "BTC oracle");
        factory.createOracle("ETH/USD", 8, "ETH oracle");
        vm.stopPrank();

        PriceOracleFactory.OracleInfo[] memory infos = factory.listOracles();
        assertEq(infos.length, 2);
        assertEq(infos[0].asset, "BTC/USD");
        assertEq(infos[1].asset, "ETH/USD");
    }

    function test_addOracle() public {
        PriceOracle externalOracle = new PriceOracle(owner, 18, "External oracle");

        vm.prank(owner);
        factory.addOracle("LINK/USD", address(externalOracle));

        PriceOracleFactory.OracleInfo memory info = factory.getOracleInfo("LINK/USD");
        assertEq(info.oracle, address(externalOracle));
        assertEq(info.decimals, 18);
        assertEq(info.description, "External oracle");
    }

    function test_updateOracle() public {
        vm.prank(owner);
        address initialOracle = factory.createOracle("BTC/USD", 8, "BTC oracle");

        PriceOracle replacement = new PriceOracle(owner, 8, "BTC oracle v2");

        vm.prank(owner);
        factory.updateOracle("BTC/USD", address(replacement));

        assertEq(factory.getOracle("BTC/USD"), address(replacement));
        assertTrue(factory.getOracle("BTC/USD") != initialOracle);
    }

    function test_removeOracle() public {
        vm.startPrank(owner);
        factory.createOracle("BTC/USD", 8, "BTC oracle");
        factory.createOracle("ETH/USD", 8, "ETH oracle");
        factory.removeOracle("BTC/USD");
        vm.stopPrank();

        assertEq(factory.getOracle("BTC/USD"), address(0));
        assertEq(factory.getOracleCount(), 1);

        PriceOracleFactory.OracleInfo memory info = factory.getOracleInfoAt(0);
        assertEq(info.asset, "ETH/USD");
    }

    function test_setOracleReporter() public {
        vm.prank(owner);
        address oracle = factory.createOracle("BTC/USD", 8, "BTC oracle");

        vm.prank(owner);
        factory.setOracleReporter("BTC/USD", reporter, true);

        assertTrue(PriceOracle(oracle).reporters(reporter));
    }

    function test_setOracleDescription() public {
        vm.prank(owner);
        address oracle = factory.createOracle("BTC/USD", 8, "BTC oracle");

        vm.prank(owner);
        factory.setOracleDescription("BTC/USD", "BTC oracle updated");

        assertEq(PriceOracle(oracle).description(), "BTC oracle updated");
    }

    function test_revertCreateDuplicateAsset() public {
        vm.startPrank(owner);
        factory.createOracle("BTC/USD", 8, "BTC oracle");
        vm.expectRevert(PriceOracleFactory.OracleAlreadyExists.selector);
        factory.createOracle("BTC/USD", 8, "BTC oracle 2");
        vm.stopPrank();
    }

    function test_revertAddInvalidOracle() public {
        vm.expectRevert(PriceOracleFactory.InvalidOracle.selector);
        vm.prank(owner);
        factory.addOracle("BTC/USD", address(0));
    }

    function test_revertManageMissingOracle() public {
        vm.expectRevert(PriceOracleFactory.OracleNotFound.selector);
        vm.prank(owner);
        factory.removeOracle("BTC/USD");
    }

    function test_revertNotOwner() public {
        vm.expectRevert();
        vm.prank(alice);
        factory.createOracle("BTC/USD", 8, "BTC oracle");
    }
}
