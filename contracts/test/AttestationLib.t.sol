// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AttestationLib} from "../src/libs/AttestationLib.sol";

contract AttestationLibTest is Test {
    using AttestationLib for AttestationLib.Agreement;

    bytes32 private constant TEST_DOMAIN = keccak256("TestDomain");

    function test_hashIsDeterministic() public pure {
        AttestationLib.Agreement memory a = AttestationLib.Agreement({
            listingId: bytes32(uint256(1)),
            offerId: bytes32(uint256(2)),
            agreedPrice: 1 ether,
            agreedConditionsHash: keccak256("gangnam friday 19:30"),
            enclaveId: bytes32(uint256(0xDEAD)),
            modelIdHash: bytes32(uint256(0xBEEF)),
            ts: 1_000_000,
            nonce: bytes16(bytes32(uint256(2)))
        });

        bytes32 h1 = AttestationLib.hash(a);
        bytes32 h2 = AttestationLib.hash(a);
        assertEq(h1, h2);
    }

    function test_hashChangesWithField() public pure {
        AttestationLib.Agreement memory a = AttestationLib.Agreement({
            listingId: bytes32(uint256(1)),
            offerId: bytes32(uint256(2)),
            agreedPrice: 1 ether,
            agreedConditionsHash: keccak256("gangnam friday 19:30"),
            enclaveId: bytes32(uint256(0xDEAD)),
            modelIdHash: bytes32(uint256(0xBEEF)),
            ts: 1_000_000,
            nonce: bytes16(bytes32(uint256(2)))
        });

        AttestationLib.Agreement memory b = AttestationLib.Agreement({
            listingId: bytes32(uint256(1)),
            offerId: bytes32(uint256(2)),
            agreedPrice: 2 ether,
            agreedConditionsHash: keccak256("gangnam friday 19:30"),
            enclaveId: bytes32(uint256(0xDEAD)),
            modelIdHash: bytes32(uint256(0xBEEF)),
            ts: 1_000_000,
            nonce: bytes16(bytes32(uint256(2)))
        });

        assertNotEq(AttestationLib.hash(a), AttestationLib.hash(b));
    }

    function test_verifyWithKnownKey() public {
        uint256 signerPk = 0xabc123def456aabbccdd1234567890aaaabbbbccccddddeeeeffff0000111222;
        address signerAddr = vm.addr(signerPk);

        AttestationLib.Agreement memory agreement = AttestationLib.Agreement({
            listingId: bytes32(uint256(1)),
            offerId: bytes32(uint256(2)),
            agreedPrice: 1 ether,
            agreedConditionsHash: keccak256("gangnam friday 19:30"),
            enclaveId: bytes32(uint256(0xDEAD)),
            modelIdHash: bytes32(uint256(0xBEEF)),
            ts: 1_000_000,
            nonce: bytes16(bytes32(uint256(2)))
        });

        bytes32 structHash = AttestationLib.hash(agreement);
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", TEST_DOMAIN, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        bool ok = AttestationLib.verify(TEST_DOMAIN, signerAddr, sig, agreement);
        assertTrue(ok, "valid sig should verify");
    }

    function test_verifyRejectedForWrongSigner() public {
        uint256 signerPk = 0xabc123def456aabbccdd1234567890aaaabbbbccccddddeeeeffff0000111222;
        address wrongAddr = address(0xDEAD);

        AttestationLib.Agreement memory agreement = AttestationLib.Agreement({
            listingId: bytes32(uint256(1)),
            offerId: bytes32(uint256(2)),
            agreedPrice: 1 ether,
            agreedConditionsHash: keccak256("gangnam"),
            enclaveId: bytes32(uint256(0xDEAD)),
            modelIdHash: bytes32(uint256(0xBEEF)),
            ts: 1_000_000,
            nonce: bytes16(bytes32(uint256(2)))
        });

        bytes32 structHash = AttestationLib.hash(agreement);
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", TEST_DOMAIN, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        bool ok = AttestationLib.verify(TEST_DOMAIN, wrongAddr, sig, agreement);
        assertFalse(ok, "wrong signer should fail");
    }
}
