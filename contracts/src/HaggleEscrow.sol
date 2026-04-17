// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IKarmaReader} from "./interfaces/IKarmaReader.sol";
import {IRLNVerifier} from "./interfaces/IRLNVerifier.sol";

/// @title HaggleEscrow
/// @notice Escrow + negotiation settlement for Haggle P2P marketplace.
///         Enforces Karma tier gating, RLN rate-limiting, and NEAR AI attestation hash recording.
contract HaggleEscrow {
    // ─── constants ───

    uint256 public constant SETTLEMENT_WINDOW = 86_400; // 24 hours
    uint256 public constant HIGH_VALUE_THRESHOLD = 500_000 ether; // demo: 500k token units

    // ─── types ───

    enum DealState {
        NONE,
        PENDING,
        LOCKED,
        COMPLETED,
        NOSHOW,
        REFUNDED
    }

    struct Listing {
        address seller;
        uint256 askPrice;
        uint8 requiredKarmaTier;
        bytes32 itemMetaHash;
        uint64 createdAt;
        bool active;
    }

    struct Deal {
        bytes32 listingId;
        bytes32 offerId;
        address seller;
        address buyer;
        uint256 agreedPrice;
        bytes32 agreedConditionsHash;
        bytes32 nearAiAttestationHash;
        DealState state;
        uint64 createdAt;
        uint64 lockedUntil;
    }

    // ─── errors ───

    error KarmaTierBelowRequired(uint8 have, uint8 need);
    error ThroughputExceeded(address who, uint256 current, uint256 max);
    error RLNProofInvalid();
    error ListingNotActive(bytes32 listingId);
    error DealNotLocked(bytes32 dealId);
    error DealNotPending(bytes32 dealId);
    error DealNotInNoShow(bytes32 dealId);
    error NotParticipant(address who);
    error AlreadyConfirmed(address who);
    error SettlementWindowOpen(bytes32 dealId);
    error ZeroAddress();
    error ZeroAmount();
    error WrongEscrowAmount(uint256 sent, uint256 required);
    error NotOwner();
    error NotRelayer();
    error AttestationHashZero();

    // ─── events ───

    event ListingCreated(
        bytes32 indexed listingId,
        address indexed seller,
        uint256 askPrice,
        uint8 requiredKarmaTier,
        bytes32 itemMetaHash
    );
    event OfferSubmitted(
        bytes32 indexed listingId,
        bytes32 indexed offerId,
        address indexed buyer,
        uint256 bidPrice,
        bytes32 rlnNullifier
    );
    event NegotiationSettled(
        bytes32 indexed dealId,
        bytes32 indexed listingId,
        bytes32 indexed nearAiAttestationHash,
        bytes32 offerId,
        uint256 agreedPrice,
        bytes32 agreedConditionsHash
    );
    event EscrowLocked(bytes32 indexed dealId, address indexed buyer, uint256 amount);
    event MeetupConfirmed(bytes32 indexed dealId, address indexed by);
    event NoShowReported(bytes32 indexed dealId, address indexed reporter, address indexed accused);
    event ThroughputExceededEvent(address indexed who, uint256 current);
    event FundsReleased(bytes32 indexed dealId, address indexed seller, uint256 amount);
    event FundsRefunded(bytes32 indexed dealId, address indexed buyer, uint256 amount);
    event AttestationRelayerUpdated(address indexed previous, address indexed current);

    // ─── state ───

    address public immutable owner;
    IKarmaReader public immutable karmaReader;
    IRLNVerifier public immutable rlnVerifier;
    address public attestationRelayer;

    mapping(bytes32 => Listing) private _listings;
    mapping(bytes32 => Deal) private _deals;

    /// @notice Per-buyer count of active (unsettled) negotiations.
    mapping(address => uint256) public activeNegotiations;

    /// @notice offerId => buyer address (set at submitOffer time).
    mapping(bytes32 => address) private _offerBuyer;

    /// @notice Confirmation state per deal per participant.
    mapping(bytes32 => mapping(address => bool)) private _confirmed;

    // ─── modifiers ───

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAttestationRelayer() {
        if (msg.sender != attestationRelayer) revert NotRelayer();
        _;
    }

    // ─── constructor ───

    constructor(address karmaReader_, address rlnVerifier_, address attestationRelayer_) {
        if (karmaReader_ == address(0)) revert ZeroAddress();
        if (rlnVerifier_ == address(0)) revert ZeroAddress();
        if (attestationRelayer_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        karmaReader = IKarmaReader(karmaReader_);
        rlnVerifier = IRLNVerifier(rlnVerifier_);
        attestationRelayer = attestationRelayer_;
    }

    // ─── admin ───

    /// @notice Update the attestation relayer address. Only callable by owner.
    function setAttestationRelayer(address newRelayer) external onlyOwner {
        if (newRelayer == address(0)) revert ZeroAddress();
        address previous = attestationRelayer;
        attestationRelayer = newRelayer;
        emit AttestationRelayerUpdated(previous, newRelayer);
    }

    // ─── listing ───

    /// @notice Seller registers a listing on-chain.
    function registerListing(uint256 askPrice, uint8 requiredKarmaTier, bytes32 itemMetaHash)
        external
        returns (bytes32 listingId)
    {
        if (askPrice == 0) revert ZeroAmount();

        listingId = keccak256(abi.encodePacked(msg.sender, itemMetaHash, block.timestamp));

        _listings[listingId] = Listing({
            seller: msg.sender,
            askPrice: askPrice,
            requiredKarmaTier: requiredKarmaTier,
            itemMetaHash: itemMetaHash,
            createdAt: uint64(block.timestamp),
            active: true
        });

        emit ListingCreated(listingId, msg.sender, askPrice, requiredKarmaTier, itemMetaHash);
    }

    // ─── offer ───

    /// @notice Buyer submits an offer. Enforces Karma tier gate, throughput limit, and RLN proof.
    /// @param rlnProof ABI-encoded (signalHash, epoch, nullifier, rlnIdentityCommitment, proof).
    function submitOffer(bytes32 listingId, uint256 bidPrice, bytes calldata rlnProof)
        external
        returns (bytes32 offerId)
    {
        if (bidPrice == 0) revert ZeroAmount();

        Listing storage listing = _listings[listingId];
        if (!listing.active) revert ListingNotActive(listingId);

        // Karma tier gate
        uint8 buyerTier = karmaReader.getTier(msg.sender);
        if (!karmaReader.canOffer(msg.sender, listing.requiredKarmaTier)) {
            revert KarmaTierBelowRequired(buyerTier, listing.requiredKarmaTier);
        }

        // High-value listing gate (Tier 2+ required for 500k+ listings)
        if (listing.askPrice >= HIGH_VALUE_THRESHOLD && buyerTier < 2) {
            revert KarmaTierBelowRequired(buyerTier, 2);
        }

        // Throughput check
        uint256 current = activeNegotiations[msg.sender];
        uint256 limit = karmaReader.getThroughputLimit(buyerTier);
        if (current >= limit) {
            emit ThroughputExceededEvent(msg.sender, current);
            revert ThroughputExceeded(msg.sender, current, limit);
        }

        // RLN proof verification
        (bytes32 signalHash, uint256 epoch, bytes32 nullifier, bytes32 rlnIdentityCommitment, bytes memory proof) =
            abi.decode(rlnProof, (bytes32, uint256, bytes32, bytes32, bytes));

        bool rlnOk = rlnVerifier.verify(signalHash, epoch, nullifier, rlnIdentityCommitment, proof);
        if (!rlnOk) revert RLNProofInvalid();

        offerId = keccak256(abi.encodePacked(msg.sender, listingId, block.timestamp));

        _offerBuyer[offerId] = msg.sender;

        unchecked {
            activeNegotiations[msg.sender] = current + 1;
        }

        emit OfferSubmitted(listingId, offerId, msg.sender, bidPrice, nullifier);
    }

    // ─── settlement ───

    /// @notice Attestation relayer settles a negotiation, recording the NEAR AI attestation hash.
    function settleNegotiation(
        bytes32 listingId,
        bytes32 offerId,
        uint256 agreedPrice,
        bytes32 agreedConditionsHash,
        bytes32 nearAiAttestationHash
    ) external onlyAttestationRelayer returns (bytes32 dealId) {
        if (nearAiAttestationHash == bytes32(0)) revert AttestationHashZero();
        if (agreedPrice == 0) revert ZeroAmount();

        address buyerAddress = _offerBuyer[offerId];
        if (buyerAddress == address(0)) revert ZeroAddress();

        Listing storage listing = _listings[listingId];
        if (!listing.active) revert ListingNotActive(listingId);

        dealId = keccak256(abi.encodePacked(listingId, offerId));

        _deals[dealId] = Deal({
            listingId: listingId,
            offerId: offerId,
            seller: listing.seller,
            buyer: buyerAddress,
            agreedPrice: agreedPrice,
            agreedConditionsHash: agreedConditionsHash,
            nearAiAttestationHash: nearAiAttestationHash,
            state: DealState.PENDING,
            createdAt: uint64(block.timestamp),
            lockedUntil: uint64(block.timestamp + SETTLEMENT_WINDOW)
        });

        // Decrement throughput for the buyer on successful settlement
        uint256 current = activeNegotiations[buyerAddress];
        if (current > 0) {
            unchecked {
                activeNegotiations[buyerAddress] = current - 1;
            }
        }

        emit NegotiationSettled(dealId, listingId, nearAiAttestationHash, offerId, agreedPrice, agreedConditionsHash);
    }

    // ─── escrow ───

    /// @notice Buyer locks agreed price into escrow.
    function lockEscrow(bytes32 dealId) external payable {
        Deal storage deal = _deals[dealId];
        if (deal.state != DealState.PENDING) revert DealNotPending(dealId);
        if (msg.value != deal.agreedPrice) revert WrongEscrowAmount(msg.value, deal.agreedPrice);

        deal.state = DealState.LOCKED;
        emit EscrowLocked(dealId, msg.sender, msg.value);
    }

    /// @notice Either party confirms the meetup. On second confirmation, funds release to seller.
    function confirmMeetup(bytes32 dealId) external {
        Deal storage deal = _deals[dealId];
        if (deal.state != DealState.LOCKED) revert DealNotLocked(dealId);
        if (msg.sender != deal.seller && msg.sender != deal.buyer) revert NotParticipant(msg.sender);
        if (_confirmed[dealId][msg.sender]) revert AlreadyConfirmed(msg.sender);

        _confirmed[dealId][msg.sender] = true;
        emit MeetupConfirmed(dealId, msg.sender);

        if (_confirmed[dealId][deal.seller] && _confirmed[dealId][deal.buyer]) {
            deal.state = DealState.COMPLETED;
            uint256 amount = deal.agreedPrice;
            address sellerAddr = deal.seller;
            emit FundsReleased(dealId, sellerAddr, amount);
            (bool ok,) = sellerAddr.call{value: amount}("");
            require(ok);
        }
    }

    /// @notice Any participant can report no-show after lockedUntil has passed.
    function reportNoShow(bytes32 dealId) external {
        Deal storage deal = _deals[dealId];
        if (deal.state != DealState.LOCKED) revert DealNotLocked(dealId);
        if (msg.sender != deal.seller && msg.sender != deal.buyer) revert NotParticipant(msg.sender);
        if (block.timestamp <= deal.lockedUntil) revert SettlementWindowOpen(dealId);

        address accused = msg.sender == deal.buyer ? deal.seller : deal.buyer;
        deal.state = DealState.NOSHOW;
        emit NoShowReported(dealId, msg.sender, accused);
    }

    /// @notice After NOSHOW, buyer pulls the refund.
    function refund(bytes32 dealId) external {
        Deal storage deal = _deals[dealId];
        if (deal.state != DealState.NOSHOW) revert DealNotInNoShow(dealId);
        if (msg.sender != deal.buyer) revert NotParticipant(msg.sender);

        deal.state = DealState.REFUNDED;
        uint256 amount = deal.agreedPrice;
        address buyerAddr = deal.buyer;
        emit FundsRefunded(dealId, buyerAddr, amount);
        (bool ok,) = buyerAddr.call{value: amount}("");
        require(ok);
    }

    // ─── cancel ───

    /// @notice Buyer cancels a settled-but-not-locked deal (state PENDING).
    /// @dev settleNegotiation already decremented activeNegotiations — no double-decrement here.
    function cancelOffer(bytes32 dealId) external {
        Deal storage deal = _deals[dealId];
        if (deal.state != DealState.PENDING) revert DealNotPending(dealId);
        if (msg.sender != deal.buyer) revert NotParticipant(msg.sender);

        deal.state = DealState.REFUNDED;
        // activeNegotiations was already decremented in settleNegotiation — do not decrement again.
    }

    // ─── views ───

    function getListing(bytes32 listingId) external view returns (Listing memory) {
        return _listings[listingId];
    }

    function getDeal(bytes32 dealId) external view returns (Deal memory) {
        return _deals[dealId];
    }
}
