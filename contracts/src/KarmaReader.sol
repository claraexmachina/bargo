// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IKarmaReader} from "./interfaces/IKarmaReader.sol";

/// @title KarmaReader
/// @notice Demo stub: owner seeds tier overrides for demo wallets.
///         Production would read SNT staking balance from Status Network.
contract KarmaReader is IKarmaReader {
    address public immutable owner;

    /// @dev tier override map; 0 = unset (defaults to tier 0)
    mapping(address => uint8) private _tierOverride;
    /// @dev tracks which addresses have an explicit override
    mapping(address => bool) private _hasOverride;

    error NotOwner();

    event TierSet(address indexed who, uint8 tier);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Owner-only: seed or update a demo wallet's tier.
    function setTier(address who, uint8 tier) external onlyOwner {
        if (who == address(0)) revert UnknownAddress(who);
        _tierOverride[who] = tier;
        _hasOverride[who] = true;
        emit TierSet(who, tier);
    }

    /// @inheritdoc IKarmaReader
    function getTier(address who) public view returns (uint8) {
        if (_hasOverride[who]) return _tierOverride[who];
        return 0;
    }

    /// @inheritdoc IKarmaReader
    function getThroughputLimit(uint8 tier) public pure returns (uint256) {
        if (tier == 0) return 3;
        if (tier == 1) return 10;
        if (tier == 2) return 20;
        return type(uint256).max;
    }

    /// @inheritdoc IKarmaReader
    function canOffer(address who, uint8 requiredTier) external view returns (bool) {
        return getTier(who) >= requiredTier;
    }
}
