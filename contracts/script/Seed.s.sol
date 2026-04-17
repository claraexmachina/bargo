// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {KarmaReader} from "../src/KarmaReader.sol";

/// @notice Seeds demo wallet tiers into KarmaReader.
///         Requires env: DEPLOYER_PRIVATE_KEY, KARMA_READER_ADDRESS,
///                       ALICE_ADDRESS, BOB_ADDRESS, EVE_ADDRESS
contract Seed is Script {
    function run() external {
        KarmaReader karmaReader = KarmaReader(vm.envAddress("KARMA_READER_ADDRESS"));
        address alice = vm.envAddress("ALICE_ADDRESS");
        address bob = vm.envAddress("BOB_ADDRESS");
        address eve = vm.envAddress("EVE_ADDRESS");

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        karmaReader.setTier(alice, 3);
        console.log("Alice (tier 3):", alice);

        karmaReader.setTier(bob, 1);
        console.log("Bob   (tier 1):", bob);

        karmaReader.setTier(eve, 0);
        console.log("Eve   (tier 0):", eve);

        vm.stopBroadcast();
    }
}
