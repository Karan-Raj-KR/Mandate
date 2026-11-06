// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {RevocationRegistry} from "../src/RevocationRegistry.sol";

contract Deploy is Script {
    function run() external returns (RevocationRegistry reg) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        reg = new RevocationRegistry();
        vm.stopBroadcast();
        console.log("RevocationRegistry deployed at", address(reg));
    }
}
