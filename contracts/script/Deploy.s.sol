// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {RLNVerifier} from "../src/RLNVerifier.sol";
import {KarmaReader} from "../src/KarmaReader.sol";
import {HaggleEscrow} from "../src/HaggleEscrow.sol";

/// @notice Deploys RLNVerifier → KarmaReader → HaggleEscrow.
///         Requires env: DEPLOYER_PRIVATE_KEY, ENCLAVE_SIGNER_ADDRESS
contract Deploy is Script {
    function run() external {
        address enclaveSigner = vm.envAddress("ENCLAVE_SIGNER_ADDRESS");

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        RLNVerifier rlnVerifier = new RLNVerifier();
        console.log("RLNVerifier:", address(rlnVerifier));

        KarmaReader karmaReader = new KarmaReader();
        console.log("KarmaReader:", address(karmaReader));

        HaggleEscrow escrow = new HaggleEscrow(address(karmaReader), address(rlnVerifier));
        console.log("HaggleEscrow:", address(escrow));

        escrow.addEnclaveSigner(enclaveSigner);
        console.log("EnclaveSignerAdded:", enclaveSigner);

        vm.stopBroadcast();
    }
}
