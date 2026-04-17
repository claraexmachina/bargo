// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BargoEscrow} from "../src/BargoEscrow.sol";
import {KarmaReader} from "../src/KarmaReader.sol";
import {RLNVerifier} from "../src/RLNVerifier.sol";
import {IRLNVerifier} from "../src/interfaces/IRLNVerifier.sol";

contract BargoEscrowTest is Test {
    BargoEscrow private escrow;
    KarmaReader private karma;
    RLNVerifier private rln;

    // Test accounts
    address private seller = makeAddr("seller");
    address private buyer = makeAddr("buyer");
    address private eve = makeAddr("eve");
    address private relayer = makeAddr("relayer");
    address private newRelayer = makeAddr("newRelayer");

    // Prices — only used at settlement, never at listing/offer time
    uint256 private constant AGREED_PRICE = 0.95 ether;

    // Attestation / conditions hashes
    bytes32 private constant ATTEST_HASH = keccak256("near-ai-attestation-bundle");
    bytes32 private constant CONDITIONS_HASH = keccak256("agreed-conditions-json");

    function setUp() public {
        karma = new KarmaReader();
        rln = new RLNVerifier();
        escrow = new BargoEscrow(address(karma), address(rln), relayer);

        // Seed karma: seller=3, buyer=0 by default
        karma.setTier(seller, 3);
    }

    // ─── helpers ───

    function _currentEpoch() internal view returns (uint256) {
        return block.timestamp / 300;
    }

    function _makeRLNProof(address who, bytes32 listingId) internal view returns (bytes memory) {
        bytes32 nullifier = keccak256(abi.encodePacked("nullifier", who, listingId));
        bytes32 signalHash = keccak256(abi.encodePacked(listingId, _currentEpoch()));
        bytes32 identity = keccak256(abi.encodePacked("identity", who));
        bytes memory proof = abi.encodePacked(keccak256(abi.encodePacked(signalHash, nullifier)));
        return abi.encode(signalHash, _currentEpoch(), nullifier, identity, proof);
    }

    function _registerListing(uint8 tier) internal returns (bytes32) {
        vm.prank(seller);
        return escrow.registerListing(tier, keccak256("macbook-meta"));
    }

    function _submitOffer(address who, bytes32 listingId) internal returns (bytes32) {
        bytes memory rlnProof = _makeRLNProof(who, listingId);
        vm.prank(who);
        return escrow.submitOffer(listingId, rlnProof);
    }

    function _settleNegotiation(bytes32 listingId, bytes32 offerId, uint256 agreedPrice) internal returns (bytes32) {
        vm.prank(relayer);
        return escrow.settleNegotiation(listingId, offerId, agreedPrice, CONDITIONS_HASH, ATTEST_HASH);
    }

    // ─── V3 sealed-bid specific tests ───

    function test_registerListing_noPrice_succeeds() public {
        // V3: listing requires only tier + metaHash — no askPrice
        bytes32 listingId = _registerListing(0);
        BargoEscrow.Listing memory listing = escrow.getListing(listingId);

        assertTrue(listing.active);
        assertEq(listing.seller, seller);
        assertEq(listing.requiredKarmaTier, 0);
        assertNotEq(listingId, bytes32(0));
    }

    function test_submitOffer_noBidPrice_succeeds() public {
        // V3: offer requires only listingId + rlnProof — no bidPrice
        bytes32 listingId = _registerListing(0);
        bytes memory rlnProof = _makeRLNProof(buyer, listingId);

        vm.prank(buyer);
        bytes32 offerId = escrow.submitOffer(listingId, rlnProof);

        assertNotEq(offerId, bytes32(0));
        assertEq(escrow.activeNegotiations(buyer), 1);
    }

    function test_settleNegotiation_agreedPriceStored() public {
        // agreedPrice is the ONLY price ever recorded — set by relayer at settlement
        bytes32 listingId = _registerListing(0);
        bytes32 offerId = _submitOffer(buyer, listingId);
        bytes32 dealId = _settleNegotiation(listingId, offerId, AGREED_PRICE);

        BargoEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(deal.agreedPrice, AGREED_PRICE);
        assertEq(uint8(deal.state), uint8(BargoEscrow.DealState.PENDING));
        assertEq(deal.buyer, buyer);
        assertEq(deal.seller, seller);
    }

    // ─── happy path ───

    function test_happyPath() public {
        // 1. Register listing (no price)
        bytes32 listingId = _registerListing(0);
        BargoEscrow.Listing memory listing = escrow.getListing(listingId);
        assertTrue(listing.active);
        assertEq(listing.seller, seller);

        // 2. Submit offer (no bid price)
        bytes32 offerId = _submitOffer(buyer, listingId);
        assertNotEq(offerId, bytes32(0));

        // 3. Settle negotiation via relayer (agreedPrice revealed here)
        bytes32 dealId = _settleNegotiation(listingId, offerId, AGREED_PRICE);
        BargoEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(uint8(deal.state), uint8(BargoEscrow.DealState.PENDING));
        assertEq(deal.buyer, buyer);
        assertEq(deal.seller, seller);
        assertEq(deal.agreedConditionsHash, CONDITIONS_HASH);
        assertEq(deal.nearAiAttestationHash, ATTEST_HASH);

        // 4. Lock escrow
        vm.deal(buyer, AGREED_PRICE);
        vm.prank(buyer);
        escrow.lockEscrow{value: AGREED_PRICE}(dealId);
        deal = escrow.getDeal(dealId);
        assertEq(uint8(deal.state), uint8(BargoEscrow.DealState.LOCKED));

        // 5. Both confirm meetup → funds released to seller
        uint256 sellerBefore = seller.balance;

        vm.prank(buyer);
        escrow.confirmMeetup(dealId);

        vm.prank(seller);
        escrow.confirmMeetup(dealId);

        deal = escrow.getDeal(dealId);
        assertEq(uint8(deal.state), uint8(BargoEscrow.DealState.COMPLETED));
        assertEq(seller.balance, sellerBefore + AGREED_PRICE);
    }

    // ─── Relayer model ───

    function test_settleNegotiation_onlyRelayer() public {
        bytes32 listingId = _registerListing(0);
        bytes32 offerId = _submitOffer(buyer, listingId);

        vm.prank(eve);
        vm.expectRevert(BargoEscrow.NotRelayer.selector);
        escrow.settleNegotiation(listingId, offerId, AGREED_PRICE, CONDITIONS_HASH, ATTEST_HASH);
    }

    function test_settleNegotiation_zeroHashReverts() public {
        bytes32 listingId = _registerListing(0);
        bytes32 offerId = _submitOffer(buyer, listingId);

        vm.prank(relayer);
        vm.expectRevert(BargoEscrow.AttestationHashZero.selector);
        escrow.settleNegotiation(listingId, offerId, AGREED_PRICE, CONDITIONS_HASH, bytes32(0));
    }

    function test_settleNegotiation_happyPath() public {
        bytes32 listingId = _registerListing(0);
        bytes32 offerId = _submitOffer(buyer, listingId);

        bytes32 expectedDealId = keccak256(abi.encodePacked(listingId, offerId));

        vm.prank(relayer);
        vm.expectEmit(true, true, true, true);
        emit BargoEscrow.NegotiationSettled(
            expectedDealId, listingId, ATTEST_HASH, offerId, AGREED_PRICE, CONDITIONS_HASH
        );
        bytes32 dealId = escrow.settleNegotiation(listingId, offerId, AGREED_PRICE, CONDITIONS_HASH, ATTEST_HASH);

        assertEq(dealId, expectedDealId);

        BargoEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(deal.agreedConditionsHash, CONDITIONS_HASH);
        assertEq(deal.nearAiAttestationHash, ATTEST_HASH);
        assertEq(deal.agreedPrice, AGREED_PRICE);
        assertEq(uint8(deal.state), uint8(BargoEscrow.DealState.PENDING));
    }

    function test_setAttestationRelayer_onlyOwner() public {
        vm.prank(eve);
        vm.expectRevert(BargoEscrow.NotOwner.selector);
        escrow.setAttestationRelayer(newRelayer);
    }

    function test_setAttestationRelayer_updates() public {
        // Owner updates relayer
        vm.expectEmit(true, true, false, false);
        emit BargoEscrow.AttestationRelayerUpdated(relayer, newRelayer);
        escrow.setAttestationRelayer(newRelayer);

        assertEq(escrow.attestationRelayer(), newRelayer);

        // New relayer can settle
        bytes32 listingId = _registerListing(0);
        bytes32 offerId = _submitOffer(buyer, listingId);

        vm.prank(newRelayer);
        bytes32 dealId = escrow.settleNegotiation(listingId, offerId, AGREED_PRICE, CONDITIONS_HASH, ATTEST_HASH);
        assertNotEq(dealId, bytes32(0));

        // Old relayer reverts on a second offer
        bytes32 listingId2;
        {
            vm.prank(seller);
            listingId2 = escrow.registerListing(0, keccak256("item2"));
        }
        bytes32 offerId2 = _submitOffer(buyer, listingId2);

        vm.prank(relayer);
        vm.expectRevert(BargoEscrow.NotRelayer.selector);
        escrow.settleNegotiation(listingId2, offerId2, AGREED_PRICE, CONDITIONS_HASH, ATTEST_HASH);
    }

    function test_setAttestationRelayer_zeroReverts() public {
        vm.expectRevert(BargoEscrow.ZeroAddress.selector);
        escrow.setAttestationRelayer(address(0));
    }

    // ─── Karma gate ───

    function test_karmaTierBelowRequired_listingTier() public {
        // requiredKarmaTier = 1, buyer = tier 0 → revert
        bytes32 listingId = _registerListing(1);
        bytes memory rlnProof = _makeRLNProof(buyer, listingId);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(BargoEscrow.KarmaTierBelowRequired.selector, uint8(0), uint8(1)));
        escrow.submitOffer(listingId, rlnProof);
    }

    function test_karmaTierGate_sellerChoosesHighTier() public {
        // Seller can manually require tier 2 for a high-value item
        bytes32 listingId = _registerListing(2);
        bytes memory rlnProof = _makeRLNProof(buyer, listingId);

        // buyer is tier 0 → revert
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(BargoEscrow.KarmaTierBelowRequired.selector, uint8(0), uint8(2)));
        escrow.submitOffer(listingId, rlnProof);

        // Tier 2 buyer can offer
        address tier2Buyer = makeAddr("tier2Buyer");
        karma.setTier(tier2Buyer, 2);
        bytes memory proof2 = _makeRLNProof(tier2Buyer, listingId);
        vm.prank(tier2Buyer);
        bytes32 offerId = escrow.submitOffer(listingId, proof2);
        assertNotEq(offerId, bytes32(0));
    }

    // ─── Throughput ───

    function test_throughputExceeded_tier0() public {
        // Tier 0 limit = 3 concurrent negotiations
        bytes32[4] memory listingIds;
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(seller);
            listingIds[i] = escrow.registerListing(0, keccak256(abi.encode("meta", i)));
        }

        // Submit 3 offers (should succeed)
        for (uint256 i = 0; i < 3; i++) {
            bytes memory proofI = _makeRLNProof(buyer, listingIds[i]);
            vm.prank(buyer);
            escrow.submitOffer(listingIds[i], proofI);
        }

        // 4th offer should revert
        bytes memory rlnProof = _makeRLNProof(buyer, listingIds[3]);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(BargoEscrow.ThroughputExceeded.selector, buyer, uint256(3), uint256(3)));
        escrow.submitOffer(listingIds[3], rlnProof);
    }

    function test_throughputDecrement_afterSettle() public {
        // Submit 3, settle 1, submit another → passes
        bytes32[4] memory listingIds;
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(seller);
            listingIds[i] = escrow.registerListing(0, keccak256(abi.encode("meta", i)));
        }

        bytes32[3] memory offerIds;
        for (uint256 i = 0; i < 3; i++) {
            bytes memory proofJ = _makeRLNProof(buyer, listingIds[i]);
            vm.prank(buyer);
            offerIds[i] = escrow.submitOffer(listingIds[i], proofJ);
        }

        assertEq(escrow.activeNegotiations(buyer), 3);

        // Settle offer 0 (decrements)
        _settleNegotiation(listingIds[0], offerIds[0], AGREED_PRICE);
        assertEq(escrow.activeNegotiations(buyer), 2);

        // Now submit 4th offer — should pass
        bytes memory rlnProof = _makeRLNProof(buyer, listingIds[3]);
        vm.prank(buyer);
        escrow.submitOffer(listingIds[3], rlnProof);
        assertEq(escrow.activeNegotiations(buyer), 3);
    }

    // ─── RLN ───

    function test_rlnNullifierZeroReverts() public {
        bytes32 listingId = _registerListing(0);

        // Encode proof with nullifier = 0
        bytes memory rlnProof =
            abi.encode(keccak256("signal"), _currentEpoch(), bytes32(0), keccak256("identity"), hex"deadbeef");

        vm.prank(buyer);
        vm.expectRevert(IRLNVerifier.ProofInvalid.selector);
        escrow.submitOffer(listingId, rlnProof);
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
            listings[i] = escrow.registerListing(0, keccak256(abi.encode("meta", i, "rln")));
        }

        // 3 successful submits using same nullifier (within RLN limit)
        for (uint256 i = 0; i < 3; i++) {
            bytes memory encodedI = abi.encode(signal, epoch, nullifier, identity, proof);
            vm.prank(rlnBuyer);
            escrow.submitOffer(listings[i], encodedI);
        }

        // 4th use of same nullifier in same epoch → RLN revert
        bytes memory encoded = abi.encode(signal, epoch, nullifier, identity, proof);
        vm.prank(rlnBuyer);
        vm.expectRevert(abi.encodeWithSelector(IRLNVerifier.NullifierAlreadyUsed.selector, nullifier));
        escrow.submitOffer(listings[3], encoded);
    }

    // ─── No-show flow ───

    function test_noShowFlow() public {
        bytes32 listingId = _registerListing(0);
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

        BargoEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(uint8(deal.state), uint8(BargoEscrow.DealState.NOSHOW));

        // Buyer pulls refund
        uint256 buyerBefore = buyer.balance;
        vm.prank(buyer);
        escrow.refund(dealId);

        deal = escrow.getDeal(dealId);
        assertEq(uint8(deal.state), uint8(BargoEscrow.DealState.REFUNDED));
        assertEq(buyer.balance, buyerBefore + AGREED_PRICE);
    }

    function test_reportNoShowBeforeWindowReverts() public {
        bytes32 listingId = _registerListing(0);
        bytes32 offerId = _submitOffer(buyer, listingId);
        bytes32 dealId = _settleNegotiation(listingId, offerId, AGREED_PRICE);

        vm.deal(buyer, AGREED_PRICE);
        vm.prank(buyer);
        escrow.lockEscrow{value: AGREED_PRICE}(dealId);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(BargoEscrow.SettlementWindowOpen.selector, dealId));
        escrow.reportNoShow(dealId);
    }

    // ─── guard conditions ───

    function test_listingNotActiveReverts() public {
        bytes32 fakeListing = keccak256("nonexistent");
        bytes memory rlnProof = _makeRLNProof(buyer, fakeListing);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(BargoEscrow.ListingNotActive.selector, fakeListing));
        escrow.submitOffer(fakeListing, rlnProof);
    }

    function test_wrongEscrowAmountReverts() public {
        bytes32 listingId = _registerListing(0);
        bytes32 offerId = _submitOffer(buyer, listingId);
        bytes32 dealId = _settleNegotiation(listingId, offerId, AGREED_PRICE);

        vm.deal(buyer, 10 ether);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(BargoEscrow.WrongEscrowAmount.selector, 1 ether, AGREED_PRICE));
        escrow.lockEscrow{value: 1 ether}(dealId);
    }

    function test_nonParticipantConfirmReverts() public {
        bytes32 listingId = _registerListing(0);
        bytes32 offerId = _submitOffer(buyer, listingId);
        bytes32 dealId = _settleNegotiation(listingId, offerId, AGREED_PRICE);

        vm.deal(buyer, AGREED_PRICE);
        vm.prank(buyer);
        escrow.lockEscrow{value: AGREED_PRICE}(dealId);

        vm.prank(eve);
        vm.expectRevert(abi.encodeWithSelector(BargoEscrow.NotParticipant.selector, eve));
        escrow.confirmMeetup(dealId);
    }

    // ─── cancelOffer ───

    function test_cancelOffer_afterSettle_noDoubleDecrement() public {
        // Submit → settle → cancel must NOT double-decrement activeNegotiations.
        bytes32 listingId = _registerListing(0);
        bytes32 offerId = _submitOffer(buyer, listingId);

        assertEq(escrow.activeNegotiations(buyer), 1);

        bytes32 dealId = _settleNegotiation(listingId, offerId, AGREED_PRICE);
        // settleNegotiation decrements → 0
        assertEq(escrow.activeNegotiations(buyer), 0);

        // Cancel: deal.state == PENDING — should succeed but NOT decrement (already at 0)
        vm.prank(buyer);
        escrow.cancelOffer(dealId);

        // Counter must remain 0, not underflow or go negative
        assertEq(escrow.activeNegotiations(buyer), 0);

        // State must be REFUNDED
        BargoEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(uint8(deal.state), uint8(BargoEscrow.DealState.REFUNDED));
    }

    function test_cancelOffer_beforeSettle_reverts() public {
        // There is no deal before settle — DealNotPending should revert.
        bytes32 fakeId = keccak256("fake-deal");
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(BargoEscrow.DealNotPending.selector, fakeId));
        escrow.cancelOffer(fakeId);
    }

    // ─── refund error ───

    function test_refund_wrongState_reverts_DealNotInNoShow() public {
        // refund() when state is PENDING (not NOSHOW) should revert with DealNotInNoShow.
        bytes32 listingId = _registerListing(0);
        bytes32 offerId = _submitOffer(buyer, listingId);
        bytes32 dealId = _settleNegotiation(listingId, offerId, AGREED_PRICE);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(BargoEscrow.DealNotInNoShow.selector, dealId));
        escrow.refund(dealId);
    }

    function test_doubleConfirmReverts() public {
        bytes32 listingId = _registerListing(0);
        bytes32 offerId = _submitOffer(buyer, listingId);
        bytes32 dealId = _settleNegotiation(listingId, offerId, AGREED_PRICE);

        vm.deal(buyer, AGREED_PRICE);
        vm.prank(buyer);
        escrow.lockEscrow{value: AGREED_PRICE}(dealId);

        vm.prank(buyer);
        escrow.confirmMeetup(dealId);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(BargoEscrow.AlreadyConfirmed.selector, buyer));
        escrow.confirmMeetup(dealId);
    }
}
