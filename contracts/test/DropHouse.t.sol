// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DropHouse} from "../src/DropHouse.sol";
import {Funder} from "../src/Funder.sol";
import {TestRupee} from "../src/TestRupee.sol";

contract DropHouseTest is Test {
    DropHouse house;
    Funder funder;
    TestRupee tinr;

    address operator = makeAddr("operator");
    address seller = makeAddr("seller");
    uint256 alicePk = 0xA11CE;
    uint256 bobPk = 0xB0B;
    uint256 carolPk = 0xCA201;
    address alice;
    address bob;
    address carol;

    uint96 constant PRICE = 450 ether;
    uint96 constant DEPOSIT = 50 ether;
    uint32 constant WINDOW = 60;
    uint256 dropId;

    event Claimed(uint256 indexed dropId, uint16 indexed piece, address indexed buyer, uint32 position, uint96 deposit);
    event TurnStarted(uint256 indexed dropId, uint16 indexed piece, address indexed buyer, uint64 deadline);
    event Forfeited(uint256 indexed dropId, uint16 indexed piece, address indexed buyer, uint96 amount);

    function setUp() public {
        alice = vm.addr(alicePk);
        bob = vm.addr(bobPk);
        carol = vm.addr(carolPk);
        house = new DropHouse();
        funder = new Funder(operator);
        tinr = funder.token();

        address[] memory to = new address[](3);
        to[0] = alice;
        to[1] = bob;
        to[2] = carol;
        vm.deal(operator, 1 ether);
        vm.prank(operator);
        funder.fund{value: 0.3 ether}(to, 0.1 ether, 1000 ether);

        vm.warp(1_000);
        vm.prank(seller);
        dropId = house.createDrop(address(tinr), 1_000, WINDOW, PRICE, DEPOSIT, 3);

        for (uint256 i = 0; i < 3; i++) {
            vm.prank(to[i]);
            tinr.approve(address(house), type(uint256).max);
        }
    }

    function _claim(address who, uint16 piece) internal {
        vm.prank(who);
        house.claim(dropId, piece);
    }

    // AC-1: order by block, then position in block
    function test_orderByBlock() public {
        vm.roll(100);
        vm.expectEmit(true, true, true, true);
        emit Claimed(dropId, 0, alice, 0, DEPOSIT);
        _claim(alice, 0);
        _claim(bob, 0); // same block, next position
        vm.roll(101);
        _claim(carol, 0);

        DropHouse.Claim[] memory q = house.queueOf(dropId, 0);
        assertEq(q.length, 3);
        assertEq(q[0].buyer, alice);
        assertEq(q[1].buyer, bob);
        assertEq(q[2].buyer, carol);
        assertEq(q[0].blockNumber, 100);
        assertEq(q[1].blockNumber, 100);
        assertEq(q[2].blockNumber, 101);
        (uint32 head, uint64 deadline,,) = house.pieces(dropId, 0);
        assertEq(head, 0);
        assertEq(deadline, block.timestamp + WINDOW);
    }

    // AC-2: a priority fee above the cap can't buy a place
    function test_tipCap() public {
        vm.fee(100 gwei);
        vm.txGasPrice(100 gwei + 3 gwei);
        vm.prank(alice);
        vm.expectRevert(bytes("tip above cap"));
        house.claim(dropId, 0);
        assertEq(tinr.balanceOf(alice), 1000 ether);

        vm.txGasPrice(100 gwei + 2 gwei); // exactly at the cap is allowed
        _claim(alice, 0);
        assertEq(house.queueLength(dropId, 0), 1);
    }

    // AC-3: a no-show's deposit goes to the seller and the next turn starts
    function test_advanceForfeits() public {
        _claim(alice, 0);
        _claim(bob, 0);

        vm.expectRevert(bytes("not yet"));
        house.advance(dropId, 0);

        vm.warp(block.timestamp + WINDOW + 1);
        vm.expectEmit(true, true, true, true);
        emit Forfeited(dropId, 0, alice, DEPOSIT);
        vm.expectEmit(true, true, true, true);
        emit TurnStarted(dropId, 0, bob, uint64(block.timestamp + WINDOW));
        house.advance(dropId, 0);

        assertEq(tinr.balanceOf(seller), DEPOSIT);
        (uint32 head, uint64 deadline,,) = house.pieces(dropId, 0);
        assertEq(head, 1);
        assertEq(deadline, block.timestamp + WINDOW);

        // alice is out: she can't pay and has nothing to withdraw
        vm.prank(alice);
        vm.expectRevert(bytes("not holder"));
        house.pay(dropId, 0);

        // queue runs dry: piece stays unsold with no holder; a new claimant becomes holder at once
        vm.warp(block.timestamp + WINDOW + 1);
        house.advance(dropId, 0);
        assertEq(tinr.balanceOf(seller), 2 * DEPOSIT);
        vm.expectRevert(bytes("no holder"));
        house.advance(dropId, 0);
        _claim(carol, 0);
        (head, deadline,,) = house.pieces(dropId, 0);
        assertEq(head, 2);
        assertEq(deadline, block.timestamp + WINDOW);
    }

    // AC-4: paying in time sells the piece; everyone else withdraws
    function test_payAndWithdraw() public {
        _claim(alice, 1);
        _claim(bob, 1);
        _claim(carol, 1);

        vm.prank(bob);
        vm.expectRevert(bytes("not holder"));
        house.pay(dropId, 1);
        vm.prank(bob);
        vm.expectRevert(bytes("not yet"));
        house.withdraw(dropId, 1);

        vm.prank(alice);
        house.pay(dropId, 1);
        (,, bool sold, address buyer) = house.pieces(dropId, 1);
        assertTrue(sold);
        assertEq(buyer, alice);
        assertEq(tinr.balanceOf(seller), PRICE);
        assertEq(tinr.balanceOf(alice), 1000 ether - PRICE);

        vm.prank(bob);
        house.withdraw(dropId, 1);
        vm.prank(carol);
        house.withdraw(dropId, 1);
        assertEq(tinr.balanceOf(bob), 1000 ether);
        assertEq(tinr.balanceOf(carol), 1000 ether);
        assertEq(tinr.balanceOf(address(house)), 0);

        vm.prank(bob);
        vm.expectRevert(bytes("nothing to withdraw"));
        house.withdraw(dropId, 1);
        vm.prank(alice);
        vm.expectRevert(bytes("nothing to withdraw"));
        house.withdraw(dropId, 1);

        vm.prank(alice);
        vm.expectRevert(bytes("sold"));
        house.advance(dropId, 1);
    }

    function test_payTooLate() public {
        _claim(alice, 0);
        vm.warp(block.timestamp + WINDOW + 1);
        vm.prank(alice);
        vm.expectRevert(bytes("too late"));
        house.pay(dropId, 0);
    }

    // AC-5: named reasons, no deposit taken
    function test_claimGuards() public {
        vm.prank(seller);
        uint256 later = house.createDrop(address(tinr), uint64(block.timestamp + 100), WINDOW, PRICE, DEPOSIT, 1);
        vm.prank(alice);
        vm.expectRevert(bytes("not started"));
        house.claim(later, 0);

        _claim(alice, 2);
        vm.prank(alice);
        vm.expectRevert(bytes("already claimed"));
        house.claim(dropId, 2);
        assertEq(tinr.balanceOf(alice), 1000 ether - DEPOSIT);

        vm.prank(alice);
        house.pay(dropId, 2);
        uint256 bobBefore = tinr.balanceOf(bob);
        vm.prank(bob);
        vm.expectRevert(bytes("sold"));
        house.claim(dropId, 2);
        assertEq(tinr.balanceOf(bob), bobBefore);

        vm.prank(bob);
        vm.expectRevert(bytes("no such piece"));
        house.claim(dropId, 3);
    }

    // The app's path: one tx per claim and per payment, with EIP-2612 permits
    function test_permitClaimAndPay() public {
        address dave = vm.addr(0xDA7E);
        address[] memory to = new address[](1);
        to[0] = dave;
        vm.prank(operator);
        funder.fund{value: 0.1 ether}(to, 0.1 ether, 1000 ether);
        assertEq(dave.balance, 0.1 ether);

        uint256 deadline = block.timestamp + 600;
        (uint8 v, bytes32 r, bytes32 s) = _permit(0xDA7E, dave, type(uint256).max, deadline);
        vm.prank(dave);
        house.claimWithPermit(dropId, 0, deadline, v, r, s);
        assertEq(tinr.balanceOf(dave), 1000 ether - DEPOSIT);

        // a stale permit (nonce already used) is harmless: the allowance from the first one stands
        vm.prank(dave);
        house.payWithPermit(dropId, 0, deadline, v, r, s);
        assertEq(tinr.balanceOf(seller), PRICE);
    }

    // The shared record: paying on time halves your deposit at the next drop (any seller); ghosting doubles it.
    function test_trackRecord() public {
        _claim(alice, 0);
        _claim(bob, 1);
        vm.prank(alice);
        house.pay(dropId, 0); // alice pays on time
        vm.warp(block.timestamp + WINDOW + 1);
        house.advance(dropId, 1); // bob ghosts
        assertEq(house.paidCount(alice), 1);
        assertEq(house.ghostCount(bob), 1);

        address otherSeller = makeAddr("otherSeller");
        vm.prank(otherSeller);
        uint256 next = house.createDrop(address(tinr), uint64(block.timestamp), WINDOW, PRICE, DEPOSIT, 2);
        assertEq(house.depositFor(next, alice), DEPOSIT / 2);
        assertEq(house.depositFor(next, bob), DEPOSIT * 2);
        assertEq(house.depositFor(next, carol), DEPOSIT); // a stranger

        uint256 aliceBefore = tinr.balanceOf(alice);
        uint256 bobBefore = tinr.balanceOf(bob);
        vm.prank(alice);
        house.claim(next, 0);
        vm.prank(bob);
        house.claim(next, 1);
        assertEq(aliceBefore - tinr.balanceOf(alice), DEPOSIT / 2);
        assertEq(bobBefore - tinr.balanceOf(bob), DEPOSIT * 2);

        // alice pays the rest of the price on top of her smaller deposit; the seller gets the full price
        vm.prank(alice);
        house.pay(next, 0);
        assertEq(tinr.balanceOf(otherSeller), PRICE);
        assertEq(house.depositFor(next, alice), DEPOSIT / 4);
        // the per-claim deposit is what moves: bob ghosts again and forfeits his 100 to the other seller
        vm.warp(block.timestamp + WINDOW + 1);
        house.advance(next, 1);
        assertEq(tinr.balanceOf(otherSeller), PRICE + DEPOSIT * 2);
        assertEq(house.depositFor(next, bob), DEPOSIT * 3);
    }

    function test_funderOnlyOperator() public {
        address[] memory to = new address[](1);
        to[0] = alice;
        vm.expectRevert(bytes("not operator"));
        funder.fund(to, 0, 1 ether);
        vm.expectRevert(bytes("not minter"));
        tinr.mint(alice, 1 ether);
    }

    function _permit(uint256 pk, address owner, uint256 value, uint256 deadline)
        internal
        view
        returns (uint8, bytes32, bytes32)
    {
        bytes32 typehash =
            keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
        bytes32 structHash = keccak256(abi.encode(typehash, owner, address(house), value, tinr.nonces(owner), deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", tinr.DOMAIN_SEPARATOR(), structHash));
        return vm.sign(pk, digest);
    }
}
