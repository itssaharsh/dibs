// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {DropHouse} from "../src/DropHouse.sol";

/// v2 (shared buyer record): redeploys DropHouse only; tINR and the Funder stay.
/// forge script script/DeployHouse.s.sol --rpc-url $RPC --broadcast
contract DeployHouse is Script {
    function run() external {
        vm.startBroadcast(vm.envUint("DEPLOYER_PK"));
        DropHouse house = new DropHouse();
        vm.stopBroadcast();
        console.log("dropHouse", address(house));
    }
}
