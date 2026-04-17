// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title AttestationLib
/// @notice EIP-712 typed data hashing and signature verification for TEE attestations.
///         Domain: name="Haggle v1", version="1"
library AttestationLib {
    bytes32 internal constant AGREEMENT_TYPEHASH = keccak256(
        "Agreement(bytes32 listingId,bytes32 offerId,uint256 agreedPrice,bytes32 agreedConditionsHash,bytes32 enclaveId,bytes32 modelIdHash,uint64 ts,bytes16 nonce)"
    );

    struct Agreement {
        bytes32 listingId;
        bytes32 offerId;
        uint256 agreedPrice;
        bytes32 agreedConditionsHash;
        bytes32 enclaveId;
        bytes32 modelIdHash;
        uint64 ts;
        bytes16 nonce;
    }

    /// @notice Returns the EIP-712 struct hash of an Agreement.
    function hash(Agreement memory agreement) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                AGREEMENT_TYPEHASH,
                agreement.listingId,
                agreement.offerId,
                agreement.agreedPrice,
                agreement.agreedConditionsHash,
                agreement.enclaveId,
                agreement.modelIdHash,
                agreement.ts,
                agreement.nonce
            )
        );
    }

    /// @notice Recovers and validates the signer of an Agreement.
    /// @param domainSeparator The EIP-712 domain separator from the calling contract.
    /// @param signer          Expected signer address.
    /// @param sig             65-byte ECDSA signature (r, s, v).
    /// @param agreement       The Agreement struct to verify.
    /// @return true if the recovered address equals `signer`.
    function verify(bytes32 domainSeparator, address signer, bytes memory sig, Agreement memory agreement)
        internal
        pure
        returns (bool)
    {
        bytes32 structHash = hash(agreement);
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        address recovered = ECDSA.recover(digest, sig);
        return recovered == signer;
    }
}
