// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {HaggleEscrow} from "../src/HaggleEscrow.sol";
import {KarmaReader} from "../src/KarmaReader.sol";
import {RLNVerifier} from "../src/RLNVerifier.sol";
import {AttestationLib} from "../src/libs/AttestationLib.sol";
import {IRLNVerifier} from "../src/interfaces/IRLNVerifier.sol";

contract HaggleEscrowTest is Test {
    HaggleEscrow private escrow;
    KarmaReader private karma;
    RLNVerifier private rln;

    // Test accounts
    address private seller = makeAddr("seller");
    address private buyer = makeAddr("buyer");
    address private eve = makeAddr("eve");

    // Mock TEE signer keypair
    uint256 private constant TEE_SIGNER_PK = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef;
    address private teeSigner;

    // Mock enclave ID
    bytes32 private constant ENCLAVE_ID = bytes32(uint256(0xDEADBEEF));

    // Prices
    uint256 private constant ASK_PRICE = 1 ether;
    uint256 private constant BID_PRICE = 0.9 ether;
    uint256 private constant AGREED_PRICE = 0.95 ether;

    // High value threshold: 500_000 ether (from HaggleEscrow constant)
    uint256 private constant HIGH_VALUE = 500_001 ether;

    function setUp() public {
        teeSigner = vm.addr(TEE_SIGNER_PK);

        karma = new KarmaReader();
        rln = new RLNVerifier();
        escrow = new HaggleEscrow(address(karma), address(rln));

        escrow.addEnclaveSigner(teeSigner);

        // Seed karma: seller=3, buyer=0 by default (no override), eve=0
        karma.setTier(seller, 3);
        // buyer stays tier 0 (default)
    }

    // ─── helpers ───

    function _currentEpoch() internal view returns (uint256) {
        return block.timestamp / 300;
    }

    function _makeRLNProof(address who, bytes32 listingId) internal view returns (bytes memory) {
        bytes32 nullifier = keccak256(abi.encodePacked("nullifier", who, listingId));
        bytes32 signalHash = keccak256(abi.encodePacked(listingId, BID_PRICE, _currentEpoch()));
        bytes32 identity = keccak256(abi.encodePacked("identity", who));
        bytes memory proof = abi.encodePacked(keccak256(abi.encodePacked(signalHash, nullifier)));
        return abi.encode(signalHash, _currentEpoch(), nullifier, identity, proof);
    }

    function _makeTeeSignature(
        bytes32 listingId,
        bytes32 offerId,
        uint256 agreedPrice,
        bytes32 attestationHash,
        uint256 signerPk
    ) internal view returns (bytes memory) {
        AttestationLib.Agreement memory agreement = AttestationLib.Agreement({
            listingId: listingId,
            offerId: offerId,
            agreedPrice: agreedPrice,
            agreedConditionsHash: attestationHash,
            enclaveId: ENCLAVE_ID,
            modelIdHash: bytes32(0),
            ts: uint64(block.timestamp),
            nonce: bytes16(offerId)
        });

        bytes32 structHash = AttestationLib.hash(agreement);
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _registerListing(uint8 tier, uint256 askPrice) internal returns (bytes32) {
        vm.prank(seller);
        return escrow.registerListing(askPrice, tier, keccak256("macbook-meta"));
    }

    function _submitOffer(address who, bytes32 listingId) internal returns (bytes32) {
        bytes memory rlnProof = _makeRLNProof(who, listingId);
        vm.prank(who);
        return escrow.submitOffer(listingId, BID_PRICE, rlnProof);
    }

    function _settleNegotiation(bytes32 listingId, bytes32 offerId, uint256 agreedPrice) internal returns (bytes32) {
        bytes32 attestationHash = keccak256("gangnam friday 19:30");
        bytes memory sig = _makeTeeSignature(listingId, offerId, agreedPrice, attestationHash, TEE_SIGNER_PK);
        return escrow.settleNegotiation(listingId, offerId, agreedPrice, attestationHash, ENCLAVE_ID, sig);
    }

    // ─── happy path ───

    function test_happyPath() public {
        // 1. Register listing
        bytes32 listingId = _registerListing(0, ASK_PRICE);
        HaggleEscrow.Listing memory listing = escrow.getListing(listingId);
        assertTrue(listing.active);
        assertEq(listing.seller, seller);

        // 2. Submit offer (buyer is tier 0, listing requires tier 0)
        bytes32 offerId = _submitOffer(buyer, listingId);
        assertNotEq(offerId, bytes32(0));

        // 3. Settle negotiation with TEE attestation
        bytes32 dealId = _settleNegotiation(listingId, offerId, AGREED_PRICE);
        HaggleEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(uint8(deal.state), uint8(HaggleEscrow.DealState.PENDING));
        assertEq(deal.buyer, buyer);
        assertEq(deal.seller, seller);

        // 4. Lock escrow
        vm.deal(buyer, AGREED_PRICE);
        vm.prank(buyer);
        escrow.lockEscrow{value: AGREED_PRICE}(dealId);
        deal = escrow.getDeal(dealId);
        assertEq(uint8(deal.state), uint8(HaggleEscrow.DealState.LOCKED));

        // 5. Both confirm meetup → funds released to seller
        uint256 sellerBefore = seller.balance;

        vm.prank(buyer);
        escrow.confirmMeetup(dealId);

        vm.prank(seller);
        escrow.confirmMeetup(dealId);

        deal = escrow.getDeal(dealId);
        assertEq(uint8(deal.state), uint8(HaggleEscrow.DealState.COMPLETED));
        assertEq(seller.balance, sellerBefore + AGREED_PRICE);
    }

    // ─── Karma gate ───

    function test_karmaTierBelowRequired_highValueListing() public {
        // Tier 0 buyer, 500k+ listing → revert
        bytes32 listingId = _registerListing(0, HIGH_VALUE);
        bytes memory rlnProof = _makeRLNProof(buyer, listingId);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(HaggleEscrow.KarmaTierBelowRequired.selector, uint8(0), uint8(2)));
        escrow.submitOffer(listingId, BID_PRICE, rlnProof);
    }

    function test_karmaTierBelowRequired_listingTier() public {
        // requiredKarmaTier = 1, buyer = tier 0 → revert
        bytes32 listingId = _registerListing(1, ASK_PRICE);
        bytes memory rlnProof = _makeRLNProof(buyer, listingId);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(HaggleEscrow.KarmaTierBelowRequired.selector, uint8(0), uint8(1)));
        escrow.submitOffer(listingId, BID_PRICE, rlnProof);
    }

    // ─── Throughput ───

    function test_throughputExceeded_tier0() public {
        // Tier 0 limit = 3 concurrent negotiations
        bytes32[4] memory listingIds;
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(seller);
            listingIds[i] = escrow.registerListing(ASK_PRICE, 0, keccak256(abi.encode("meta", i)));
        }

        // Submit 3 offers (should succeed)
        for (uint256 i = 0; i < 3; i++) {
            bytes memory proofI = _makeRLNProof(buyer, listingIds[i]);
            vm.prank(buyer);
            escrow.submitOffer(listingIds[i], BID_PRICE, proofI);
        }

        // 4th offer should revert
        bytes memory rlnProof = _makeRLNProof(buyer, listingIds[3]);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(HaggleEscrow.ThroughputExceeded.selector, buyer, uint256(3), uint256(3)));
        escrow.submitOffer(listingIds[3], BID_PRICE, rlnProof);
    }

    function test_throughputDecrement_afterSettle() public {
        // Submit 3, settle 1, submit another → passes
        bytes32[4] memory listingIds;
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(seller);
            listingIds[i] = escrow.registerListing(ASK_PRICE, 0, keccak256(abi.encode("meta", i)));
        }

        bytes32[3] memory offerIds;
        for (uint256 i = 0; i < 3; i++) {
            bytes memory proofJ = _makeRLNProof(buyer, listingIds[i]);
            vm.prank(buyer);
            offerIds[i] = escrow.submitOffer(listingIds[i], BID_PRICE, proofJ);
        }

        assertEq(escrow.activeNegotiations(buyer), 3);

        // Settle offer 0 (decrements)
        _settleNegotiation(listingIds[0], offerIds[0], AGREED_PRICE);
        assertEq(escrow.activeNegotiations(buyer), 2);

        // Now submit 4th offer — should pass
        bytes memory rlnProof = _makeRLNProof(buyer, listingIds[3]);
        vm.prank(buyer);
        escrow.submitOffer(listingIds[3], BID_PRICE, rlnProof);
        assertEq(escrow.activeNegotiations(buyer), 3);
    }

    // ─── RLN ───

    function test_rlnNullifierZeroReverts() public {
        bytes32 listingId = _registerListing(0, ASK_PRICE);

        // Encode proof with nullifier = 0
        bytes memory rlnProof =
            abi.encode(keccak256("signal"), _currentEpoch(), bytes32(0), keccak256("identity"), hex"deadbeef");

        vm.prank(buyer);
        // RLNVerifier.ProofInvalid is caught and re-thrown as RLNProofInvalid
        // Actually RLNVerifier reverts internally; escrow propagates the revert
        vm.expectRevert(IRLNVerifier.ProofInvalid.selector);
        escrow.submitOffer(listingId, BID_PRICE, rlnProof);
    }

    function test_rln4thUseReverts() public {
        // Use a tier-1 buyer so throughput limit (10) won't block before RLN check
        address rlnBuyer = makeAddr("rlnBuyer");
        karma.setTier(rlnBuyer, 1);

        bytes32 nullifier = keccak256("fixednullifier");
        bytes32 signal = keccak256("signal");
        bytes32 identity = keccak256("identity");
        bytes memory proof = abi.encodePacked(keccak256("proof"));

        uint256 epoch = _currentEpoch();

        // Create 4 listings
        bytes32[4] memory listings;
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(seller);
            listings[i] = escrow.registerListing(ASK_PRICE, 0, keccak256(abi.encode("meta", i, "rln")));
        }

        // 3 successful submits using same nullifier (within RLN limit)
        for (uint256 i = 0; i < 3; i++) {
            bytes memory encodedI = abi.encode(signal, epoch, nullifier, identity, proof);
            vm.prank(rlnBuyer);
            escrow.submitOffer(listings[i], BID_PRICE, encodedI);
        }

        // 4th use of same nullifier in same epoch → RLN revert
        bytes memory encoded = abi.encode(signal, epoch, nullifier, identity, proof);
        vm.prank(rlnBuyer);
        vm.expectRevert(abi.encodeWithSelector(IRLNVerifier.NullifierAlreadyUsed.selector, nullifier));
        escrow.submitOffer(listings[3], BID_PRICE, encoded);
    }

    // ─── Attestation ───

    function test_tamperedSignatureReverts() public {
        bytes32 listingId = _registerListing(0, ASK_PRICE);
        bytes32 offerId = _submitOffer(buyer, listingId);

        bytes32 attestationHash = keccak256("gangnam");

        // Use a different (wrong) private key to sign
        uint256 wrongPk = 0xBADBADBADBADBADBADBADBADBADBADBADBADBADBADBADBADBADBADBADBADBAD1;
        bytes memory sig = _makeTeeSignature(listingId, offerId, AGREED_PRICE, attestationHash, wrongPk);

        vm.expectRevert(abi.encodeWithSelector(HaggleEscrow.UnknownEnclave.selector, ENCLAVE_ID));
        escrow.settleNegotiation(listingId, offerId, AGREED_PRICE, attestationHash, ENCLAVE_ID, sig);
    }

    function test_unknownEnclaveReverts() public {
        bytes32 listingId = _registerListing(0, ASK_PRICE);
        bytes32 offerId = _submitOffer(buyer, listingId);

        bytes32 attestationHash = keccak256("gangnam");

        // Use a not-whitelisted private key
        uint256 notWhitelistedPk = 0xABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF012345678;
        address notWhitelistedAddr = vm.addr(notWhitelistedPk);
        assertFalse(escrow.enclaveSigner(notWhitelistedAddr));

        bytes memory sig = _makeTeeSignature(listingId, offerId, AGREED_PRICE, attestationHash, notWhitelistedPk);

        vm.expectRevert(abi.encodeWithSelector(HaggleEscrow.UnknownEnclave.selector, ENCLAVE_ID));
        escrow.settleNegotiation(listingId, offerId, AGREED_PRICE, attestationHash, ENCLAVE_ID, sig);
    }

    // ─── No-show flow ───

    function test_noShowFlow() public {
        bytes32 listingId = _registerListing(0, ASK_PRICE);
        bytes32 offerId = _submitOffer(buyer, listingId);
        bytes32 dealId = _settleNegotiation(listingId, offerId, AGREED_PRICE);

        vm.deal(buyer, AGREED_PRICE);
        vm.prank(buyer);
        escrow.lockEscrow{value: AGREED_PRICE}(dealId);

        // Warp past lockedUntil
        vm.warp(block.timestamp + escrow.SETTLEMENT_WINDOW() + 1);

        // Report no-show
        vm.prank(buyer);
        escrow.reportNoShow(dealId);

        HaggleEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(uint8(deal.state), uint8(HaggleEscrow.DealState.NOSHOW));

        // Buyer pulls refund
        uint256 buyerBefore = buyer.balance;
        vm.prank(buyer);
        escrow.refund(dealId);

        deal = escrow.getDeal(dealId);
        assertEq(uint8(deal.state), uint8(HaggleEscrow.DealState.REFUNDED));
        assertEq(buyer.balance, buyerBefore + AGREED_PRICE);
    }

    function test_reportNoShowBeforeWindowReverts() public {
        bytes32 listingId = _registerListing(0, ASK_PRICE);
        bytes32 offerId = _submitOffer(buyer, listingId);
        bytes32 dealId = _settleNegotiation(listingId, offerId, AGREED_PRICE);

        vm.deal(buyer, AGREED_PRICE);
        vm.prank(buyer);
        escrow.lockEscrow{value: AGREED_PRICE}(dealId);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(HaggleEscrow.SettlementWindowOpen.selector, dealId));
        escrow.reportNoShow(dealId);
    }

    // ─── guard conditions ───

    function test_listingNotActiveReverts() public {
        bytes32 fakeListing = keccak256("nonexistent");
        bytes memory rlnProof = _makeRLNProof(buyer, fakeListing);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(HaggleEscrow.ListingNotActive.selector, fakeListing));
        escrow.submitOffer(fakeListing, BID_PRICE, rlnProof);
    }

    function test_zeroAmountListingReverts() public {
        vm.prank(seller);
        vm.expectRevert(HaggleEscrow.ZeroAmount.selector);
        escrow.registerListing(0, 0, keccak256("meta"));
    }

    function test_zeroAmountOfferReverts() public {
        bytes32 listingId = _registerListing(0, ASK_PRICE);
        bytes memory rlnProof = _makeRLNProof(buyer, listingId);

        vm.prank(buyer);
        vm.expectRevert(HaggleEscrow.ZeroAmount.selector);
        escrow.submitOffer(listingId, 0, rlnProof);
    }

    function test_wrongEscrowAmountReverts() public {
        bytes32 listingId = _registerListing(0, ASK_PRICE);
        bytes32 offerId = _submitOffer(buyer, listingId);
        bytes32 dealId = _settleNegotiation(listingId, offerId, AGREED_PRICE);

        vm.deal(buyer, 10 ether);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(HaggleEscrow.WrongEscrowAmount.selector, 1 ether, AGREED_PRICE));
        escrow.lockEscrow{value: 1 ether}(dealId);
    }

    function test_nonParticipantConfirmReverts() public {
        bytes32 listingId = _registerListing(0, ASK_PRICE);
        bytes32 offerId = _submitOffer(buyer, listingId);
        bytes32 dealId = _settleNegotiation(listingId, offerId, AGREED_PRICE);

        vm.deal(buyer, AGREED_PRICE);
        vm.prank(buyer);
        escrow.lockEscrow{value: AGREED_PRICE}(dealId);

        vm.prank(eve);
        vm.expectRevert(abi.encodeWithSelector(HaggleEscrow.NotParticipant.selector, eve));
        escrow.confirmMeetup(dealId);
    }

    function test_doubleConfirmReverts() public {
        bytes32 listingId = _registerListing(0, ASK_PRICE);
        bytes32 offerId = _submitOffer(buyer, listingId);
        bytes32 dealId = _settleNegotiation(listingId, offerId, AGREED_PRICE);

        vm.deal(buyer, AGREED_PRICE);
        vm.prank(buyer);
        escrow.lockEscrow{value: AGREED_PRICE}(dealId);

        vm.prank(buyer);
        escrow.confirmMeetup(dealId);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(HaggleEscrow.AlreadyConfirmed.selector, buyer));
        escrow.confirmMeetup(dealId);
    }
}
