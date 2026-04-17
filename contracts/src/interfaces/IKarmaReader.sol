// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IKarmaReader {
    error UnknownAddress(address who);

    /// @notice Returns the Karma tier (0..3) for an address.
    function getTier(address who) external view returns (uint8);

    /// @notice Returns the maximum concurrent negotiations for a given tier.
    function getThroughputLimit(uint8 tier) external pure returns (uint256);

    /// @notice Returns true if `who` is permitted to offer on a listing requiring `requiredTier`.
    function canOffer(address who, uint8 requiredTier) external view returns (bool);
}
