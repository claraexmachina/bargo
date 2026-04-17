// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRLNVerifier {
    error NullifierAlreadyUsed(bytes32 nullifier);
    error ProofInvalid();
    error EpochTooOld(uint256 epoch);

    /// @notice Verifies an RLN proof and records the nullifier usage.
    /// @return true if proof is valid and nullifier is within rate limit.
    function verify(
        bytes32 signalHash,
        uint256 epoch,
        bytes32 nullifier,
        bytes32 rlnIdentityCommitment,
        bytes calldata proof
    ) external returns (bool);

    /// @notice Epoch duration in seconds (300).
    function EPOCH_DURATION() external pure returns (uint256);

    /// @notice Maximum uses per nullifier per epoch (3).
    function MAX_PER_EPOCH() external pure returns (uint256);
}
