// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RLNVerifier} from "../src/RLNVerifier.sol";
import {IRLNVerifier} from "../src/interfaces/IRLNVerifier.sol";

contract RLNVerifierTest is Test {
    RLNVerifier private rln;

    bytes32 private constant SIGNAL = keccak256("signal");
    bytes32 private constant NULLIFIER = keccak256("nullifier");
    bytes32 private constant IDENTITY = keccak256("identity");
    bytes private constant PROOF = hex"deadbeef";

    function setUp() public {
        rln = new RLNVerifier();
    }

    function _currentEpoch() internal view returns (uint256) {
        return block.timestamp / 300;
    }

    function test_constants() public view {
        assertEq(rln.EPOCH_DURATION(), 300);
        assertEq(rln.MAX_PER_EPOCH(), 3);
    }

    function test_verifyOk() public {
        bool ok = rln.verify(SIGNAL, _currentEpoch(), NULLIFIER, IDENTITY, PROOF);
        assertTrue(ok);
    }

    function test_nullifierZeroReverts() public {
        vm.expectRevert(IRLNVerifier.ProofInvalid.selector);
        rln.verify(SIGNAL, _currentEpoch(), bytes32(0), IDENTITY, PROOF);
    }

    function test_fourthUseReverts() public {
        uint256 epoch = _currentEpoch();
        rln.verify(SIGNAL, epoch, NULLIFIER, IDENTITY, PROOF);
        rln.verify(SIGNAL, epoch, NULLIFIER, IDENTITY, PROOF);
        rln.verify(SIGNAL, epoch, NULLIFIER, IDENTITY, PROOF);

        vm.expectRevert(abi.encodeWithSelector(IRLNVerifier.NullifierAlreadyUsed.selector, NULLIFIER));
        rln.verify(SIGNAL, epoch, NULLIFIER, IDENTITY, PROOF);
    }

    function test_differentNullifiersIndependent() public {
        bytes32 n1 = keccak256("n1");
        bytes32 n2 = keccak256("n2");
        uint256 epoch = _currentEpoch();

        // Use n1 3 times
        rln.verify(SIGNAL, epoch, n1, IDENTITY, PROOF);
        rln.verify(SIGNAL, epoch, n1, IDENTITY, PROOF);
        rln.verify(SIGNAL, epoch, n1, IDENTITY, PROOF);

        // n2 should still be usable
        bool ok = rln.verify(SIGNAL, epoch, n2, IDENTITY, PROOF);
        assertTrue(ok);
    }

    function test_epochTooOldReverts() public {
        // Warp to t=10000 so current epoch = 33, old epoch = 28 (5 behind, more than 2 allowed)
        vm.warp(10_000);
        uint256 oldEpoch = _currentEpoch() - 5;
        vm.expectRevert(abi.encodeWithSelector(IRLNVerifier.EpochTooOld.selector, oldEpoch));
        rln.verify(SIGNAL, oldEpoch, NULLIFIER, IDENTITY, PROOF);
    }

    function test_differentEpochsSeparateCount() public {
        uint256 epoch1 = _currentEpoch();
        uint256 epoch2 = epoch1 + 1;

        // Use max in epoch1
        rln.verify(SIGNAL, epoch1, NULLIFIER, IDENTITY, PROOF);
        rln.verify(SIGNAL, epoch1, NULLIFIER, IDENTITY, PROOF);
        rln.verify(SIGNAL, epoch1, NULLIFIER, IDENTITY, PROOF);

        // epoch2 should be fresh
        vm.warp(block.timestamp + 300);
        bool ok = rln.verify(SIGNAL, epoch2, NULLIFIER, IDENTITY, PROOF);
        assertTrue(ok);
    }
}
