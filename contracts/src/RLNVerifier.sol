// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRLNVerifier} from "./interfaces/IRLNVerifier.sol";

/// @title RLNVerifier
/// @notice Demo stub for Rate Limiting Nullifier verification.
///         Real implementation swaps in Status Network's ZK verifier.
///         Enforces: nullifier != 0, per-epoch count < MAX_PER_EPOCH, epoch is current-ish.
contract RLNVerifier is IRLNVerifier {
    uint256 private constant _EPOCH_DURATION = 300; // 5 minutes
    uint256 private constant _MAX_PER_EPOCH = 3;

    /// @dev nullifier => epoch => use count
    mapping(bytes32 => mapping(uint256 => uint256)) public nullifierEpochCount;

    /// @dev nullifier => first epoch seen
    mapping(bytes32 => uint256) public nullifierFirstEpoch;

    /// @inheritdoc IRLNVerifier
    function EPOCH_DURATION() external pure returns (uint256) {
        return _EPOCH_DURATION;
    }

    /// @inheritdoc IRLNVerifier
    function MAX_PER_EPOCH() external pure returns (uint256) {
        return _MAX_PER_EPOCH;
    }

    /// @inheritdoc IRLNVerifier
    function verify(
        bytes32, /* signalHash */
        uint256 epoch,
        bytes32 nullifier,
        bytes32, /* rlnIdentityCommitment */
        bytes calldata /* proof */
    )
        external
        returns (bool)
    {
        if (nullifier == bytes32(0)) revert ProofInvalid();

        uint256 currentEpoch = block.timestamp / _EPOCH_DURATION;

        // Reject proofs more than 2 epochs old or from the future
        if (epoch + 2 < currentEpoch || epoch > currentEpoch + 1) {
            revert EpochTooOld(epoch);
        }

        uint256 count = nullifierEpochCount[nullifier][epoch];
        if (count >= _MAX_PER_EPOCH) revert NullifierAlreadyUsed(nullifier);

        unchecked {
            nullifierEpochCount[nullifier][epoch] = count + 1;
        }

        if (nullifierFirstEpoch[nullifier] == 0) {
            nullifierFirstEpoch[nullifier] = epoch;
        }

        return true;
    }
}
