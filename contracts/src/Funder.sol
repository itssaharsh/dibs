// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestRupee} from "./TestRupee.sol";

/// @notice Funds a batch of burner wallets in one tx: gas MON (forwarded, never held) plus minted tINR.
contract Funder {
    address public immutable operator;
    TestRupee public immutable token;

    event Funded(address indexed to, uint256 gas, uint256 tinr);

    constructor(address operator_) {
        operator = operator_;
        token = new TestRupee(address(this));
    }

    function fund(address[] calldata to, uint256 gasEach, uint256 tinrEach) external payable {
        require(msg.sender == operator, "not operator");
        require(msg.value == gasEach * to.length, "bad value");
        for (uint256 i = 0; i < to.length; i++) {
            if (gasEach > 0) {
                (bool ok,) = to[i].call{value: gasEach}("");
                require(ok, "gas send failed");
            }
            if (tinrEach > 0) token.mint(to[i], tinrEach);
            emit Funded(to[i], gasEach, tinrEach);
        }
    }
}
