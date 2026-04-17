// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {KarmaReader} from "../src/KarmaReader.sol";
import {IKarmaReader} from "../src/interfaces/IKarmaReader.sol";

contract KarmaReaderTest is Test {
    KarmaReader private karma;
    address private alice = makeAddr("alice");
    address private bob = makeAddr("bob");
    address private eve = makeAddr("eve");

    function setUp() public {
        karma = new KarmaReader();
        karma.setTier(alice, 3);
        karma.setTier(bob, 1);
    }

    function test_getTierWithOverride() public view {
        assertEq(karma.getTier(alice), 3);
        assertEq(karma.getTier(bob), 1);
    }

    function test_getTierDefaultsZero() public view {
        assertEq(karma.getTier(eve), 0);
    }

    function test_throughputLimits() public view {
        assertEq(karma.getThroughputLimit(0), 3);
        assertEq(karma.getThroughputLimit(1), 10);
        assertEq(karma.getThroughputLimit(2), 20);
        assertEq(karma.getThroughputLimit(3), type(uint256).max);
    }

    function test_canOffer() public view {
        assertTrue(karma.canOffer(alice, 3), "tier3 can offer on tier3 listing");
        assertTrue(karma.canOffer(alice, 0), "tier3 can offer on tier0 listing");
        assertFalse(karma.canOffer(eve, 1), "tier0 cannot offer on tier1 listing");
        assertTrue(karma.canOffer(bob, 1), "tier1 can offer on tier1 listing");
    }

    function test_onlyOwnerCanSetTier() public {
        vm.prank(alice);
        vm.expectRevert(KarmaReader.NotOwner.selector);
        karma.setTier(eve, 2);
    }

    function test_setTierZeroAddressReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IKarmaReader.UnknownAddress.selector, address(0)));
        karma.setTier(address(0), 1);
    }
}
