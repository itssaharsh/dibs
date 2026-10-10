// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {DropHouse} from "../src/DropHouse.sol";
import {Funder} from "../src/Funder.sol";

/// forge script script/Deploy.s.sol --rpc-url $RPC --broadcast   (DEPLOYER_PK and OPERATOR_PK from .env)
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address operator = vm.addr(vm.envUint("OPERATOR_PK"));
        vm.startBroadcast(pk);
        Funder funder = new Funder(operator);
        DropHouse house = new DropHouse();
        vm.stopBroadcast();
        console.log("token", address(funder.token()));
        console.log("funder", address(funder));
        console.log("dropHouse", address(house));
    }
}
