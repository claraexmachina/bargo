// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IKarmaReader} from "./interfaces/IKarmaReader.sol";
import {IRLNVerifier} from "./interfaces/IRLNVerifier.sol";
import {AttestationLib} from "./libs/AttestationLib.sol";

/// @title HaggleEscrow
/// @notice Escrow + negotiation settlement for Haggle P2P marketplace.
///         Enforces Karma tier gating, RLN rate-limiting, and TEE attestation verification.
contract HaggleEscrow is EIP712 {
    using AttestationLib for AttestationLib.Agreement;

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
        bytes32 attestationHash;
        bytes32 enclaveId;
        DealState state;
        uint64 createdAt;
        uint64 lockedUntil;
    }

    // ─── errors ───

    error KarmaTierBelowRequired(uint8 have, uint8 need);
    error ThroughputExceeded(address who, uint256 current, uint256 max);
    error RLNProofInvalid();
    error ListingNotActive(bytes32 listingId);
    error UnknownEnclave(bytes32 enclaveId);
    error AttestationSigInvalid();
    error DealNotLocked(bytes32 dealId);
    error DealNotPending(bytes32 dealId);
    error NotParticipant(address who);
    error AlreadyConfirmed(address who);
    error SettlementWindowOpen(bytes32 dealId);
    error ZeroAddress();
    error ZeroAmount();
    error WrongEscrowAmount(uint256 sent, uint256 required);
    error NotOwner();

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
        bytes32 indexed offerId,
        uint256 agreedPrice,
        bytes32 enclaveId,
        bytes32 attestationHash
    );
    event EscrowLocked(bytes32 indexed dealId, address indexed buyer, uint256 amount);
    event MeetupConfirmed(bytes32 indexed dealId, address indexed by);
    event NoShowReported(bytes32 indexed dealId, address indexed reporter, address indexed accused);
    event ThroughputExceededEvent(address indexed who, uint256 current);
    event FundsReleased(bytes32 indexed dealId, address indexed seller, uint256 amount);
    event FundsRefunded(bytes32 indexed dealId, address indexed buyer, uint256 amount);
    event EnclaveSignerAdded(address indexed signer);

    // ─── state ───

    address public immutable owner;
    IKarmaReader public immutable karmaReader;
    IRLNVerifier public immutable rlnVerifier;

    mapping(bytes32 => Listing) private _listings;
    mapping(bytes32 => Deal) private _deals;

    /// @notice Per-buyer count of active (unsettled) negotiations.
    mapping(address => uint256) public activeNegotiations;

    /// @notice Whitelisted TEE enclave signer addresses (secp256k1).
    mapping(address => bool) public enclaveSigner;

    /// @notice offerId => buyer address (set at submitOffer time).
    mapping(bytes32 => address) private _offerBuyer;

    /// @notice Confirmation state per deal per participant.
    mapping(bytes32 => mapping(address => bool)) private _confirmed;

    // ─── modifiers ───

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ─── constructor ───

    constructor(address karmaReader_, address rlnVerifier_) EIP712("Haggle v1", "1") {
        if (karmaReader_ == address(0)) revert ZeroAddress();
        if (rlnVerifier_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        karmaReader = IKarmaReader(karmaReader_);
        rlnVerifier = IRLNVerifier(rlnVerifier_);
    }

    // ─── admin ───

    /// @notice Add a TEE enclave signer address to the whitelist.
    function addEnclaveSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();
        enclaveSigner[signer] = true;
        emit EnclaveSignerAdded(signer);
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

    /// @notice TEE (or relayer on TEE's behalf) settles a negotiation with an attestation.
    function settleNegotiation(
        bytes32 listingId,
        bytes32 offerId,
        uint256 agreedPrice,
        bytes32 attestationHash,
        bytes32 enclaveId,
        bytes calldata teeSignature
    ) external returns (bytes32 dealId) {
        if (agreedPrice == 0) revert ZeroAmount();

        address buyerAddress = _offerBuyer[offerId];
        if (buyerAddress == address(0)) revert ZeroAddress();

        Listing storage listing = _listings[listingId];
        if (!listing.active) revert ListingNotActive(listingId);

        // Build the Agreement struct that the TEE signed.
        // nonce uses first 16 bytes of offerId for replay protection.
        AttestationLib.Agreement memory agreement = AttestationLib.Agreement({
            listingId: listingId,
            offerId: offerId,
            agreedPrice: agreedPrice,
            agreedConditionsHash: attestationHash,
            enclaveId: enclaveId,
            modelIdHash: bytes32(0),
            ts: uint64(block.timestamp),
            nonce: bytes16(offerId)
        });

        // Recover ECDSA signer; revert if signature is malformed
        bytes32 structHash = AttestationLib.hash(agreement);
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparatorV4(), structHash));
        address recovered = _recoverSigner(digest, teeSignature);

        if (recovered == address(0)) revert AttestationSigInvalid();
        if (!enclaveSigner[recovered]) revert UnknownEnclave(enclaveId);

        dealId = keccak256(abi.encodePacked(listingId, offerId));

        _deals[dealId] = Deal({
            listingId: listingId,
            offerId: offerId,
            seller: listing.seller,
            buyer: buyerAddress,
            agreedPrice: agreedPrice,
            attestationHash: attestationHash,
            enclaveId: enclaveId,
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

        emit NegotiationSettled(dealId, listingId, offerId, agreedPrice, enclaveId, attestationHash);
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
            address seller = deal.seller;
            emit FundsReleased(dealId, seller, amount);
            (bool ok,) = seller.call{value: amount}("");
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
        if (deal.state != DealState.NOSHOW) revert DealNotLocked(dealId);
        if (msg.sender != deal.buyer) revert NotParticipant(msg.sender);

        deal.state = DealState.REFUNDED;
        uint256 amount = deal.agreedPrice;
        address buyer = deal.buyer;
        emit FundsRefunded(dealId, buyer, amount);
        (bool ok,) = buyer.call{value: amount}("");
        require(ok);
    }

    // ─── cancel ───

    /// @notice Buyer cancels a pending offer (before settlement), decrementing throughput.
    function cancelOffer(bytes32 dealId) external {
        Deal storage deal = _deals[dealId];
        if (deal.state != DealState.PENDING) revert DealNotPending(dealId);
        if (msg.sender != deal.buyer) revert NotParticipant(msg.sender);

        deal.state = DealState.REFUNDED;

        uint256 current = activeNegotiations[msg.sender];
        if (current > 0) {
            unchecked {
                activeNegotiations[msg.sender] = current - 1;
            }
        }
    }

    // ─── views ───

    function getListing(bytes32 listingId) external view returns (Listing memory) {
        return _listings[listingId];
    }

    function getDeal(bytes32 dealId) external view returns (Deal memory) {
        return _deals[dealId];
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ─── internal ───

    function _recoverSigner(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        return ecrecover(digest, v, r, s);
    }
}
