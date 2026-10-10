// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20, ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @notice Test rupee (tINR). Test money only; minted by the Funder for demo wallets.
contract TestRupee is ERC20Permit {
    address public immutable minter;

    constructor(address minter_) ERC20("Test Rupee", "tINR") ERC20Permit("Test Rupee") {
        minter = minter_;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "not minter");
        _mint(to, amount);
    }
}
