// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title DropHouse — "dibs" with a deposit behind it, and a buyer track record every store shares.
/// @notice Calls of dibs are ordered by the chain (block, then position in block). Each call locks a deposit.
/// First dibs has `payWindow` seconds to pay; if they don't, anyone can `advance()`: the deposit goes to the
/// seller and the next caller is up. Every outcome updates the buyer's record (paid on time / ghosted), and
/// the record prices the deposit at every drop, whoever the seller is. Nobody can edit a line or a record.
contract DropHouse {
    using SafeERC20 for IERC20;

    /// @dev Monad leaders order by priority fee; capping the tip means a fee can't buy a place.
    uint256 public constant MAX_TIP = 2 gwei;

    struct Drop {
        address seller;
        address token;
        uint64 startsAt;
        uint32 payWindow;
        uint96 price;
        uint96 deposit;
        uint16 pieces;
    }

    struct Claim {
        address buyer;
        uint64 blockNumber;
        uint96 deposit; // what this buyer put down, priced by their record at claim time
    }

    struct Piece {
        uint32 head; // index of the current holder in the queue
        uint64 deadline; // holder must pay by this timestamp (0 when nobody holds)
        bool sold;
        address buyer;
    }

    uint256 public dropCount;
    mapping(uint256 => Drop) public drops;
    mapping(uint256 => mapping(uint16 => Piece)) public pieces;
    mapping(uint256 => mapping(uint16 => Claim[])) internal queues;
    /// @dev position + 1 of a buyer's claim on a piece (0 = no claim)
    mapping(uint256 => mapping(uint16 => mapping(address => uint32))) public claimPos;
    /// @notice The shared track record: written only by this contract's own outcomes.
    mapping(address => uint32) public paidCount;
    mapping(address => uint32) public ghostCount;
    /// @dev true once a claimant's deposit has left escrow (paid, forfeited or refunded)
    mapping(uint256 => mapping(uint16 => mapping(address => bool))) public settled;

    event DropCreated(
        uint256 indexed dropId,
        address indexed seller,
        uint64 startsAt,
        uint32 payWindow,
        uint96 price,
        uint96 deposit,
        uint16 pieces
    );
    event Claimed(uint256 indexed dropId, uint16 indexed piece, address indexed buyer, uint32 position, uint96 deposit);
    event TurnStarted(uint256 indexed dropId, uint16 indexed piece, address indexed buyer, uint64 deadline);
    event Paid(uint256 indexed dropId, uint16 indexed piece, address indexed buyer, uint96 amount);
    event Forfeited(uint256 indexed dropId, uint16 indexed piece, address indexed buyer, uint96 amount);
    event Refunded(uint256 indexed dropId, uint16 indexed piece, address indexed buyer, uint96 amount);

    function createDrop(address token, uint64 startsAt, uint32 payWindow, uint96 price, uint96 deposit, uint16 pieceCount)
        external
        returns (uint256 dropId)
    {
        require(token != address(0) && pieceCount > 0 && payWindow > 0, "bad drop");
        require(deposit > 0 && deposit <= price, "bad deposit");
        dropId = ++dropCount;
        drops[dropId] = Drop(msg.sender, token, startsAt, payWindow, price, deposit, pieceCount);
        emit DropCreated(dropId, msg.sender, startsAt, payWindow, price, deposit, pieceCount);
    }

    // ---------------------------------------------------------------- claim

    function claimWithPermit(uint256 dropId, uint16 piece, uint256 permitDeadline, uint8 v, bytes32 r, bytes32 s)
        external
    {
        Drop storage d = drops[dropId];
        // The buyer signs one allowance for this contract (test money). A front-run or already-used permit
        // leaves the allowance in place, so the transferFrom below still succeeds.
        try IERC20Permit(d.token).permit(msg.sender, address(this), type(uint256).max, permitDeadline, v, r, s) {} catch {}
        _claim(dropId, piece);
    }

    function claim(uint256 dropId, uint16 piece) external {
        _claim(dropId, piece);
    }

    function _claim(uint256 dropId, uint16 piece) internal {
        Drop storage d = drops[dropId];
        require(d.seller != address(0) && piece < d.pieces, "no such piece");
        require(block.timestamp >= d.startsAt, "not started");
        Piece storage p = pieces[dropId][piece];
        require(!p.sold, "sold");
        require(claimPos[dropId][piece][msg.sender] == 0, "already claimed");
        require(tx.gasprice <= block.basefee || tx.gasprice - block.basefee <= MAX_TIP, "tip above cap");

        Claim[] storage q = queues[dropId][piece];
        uint256 position = q.length;
        uint96 dep = depositFor(dropId, msg.sender);
        claimPos[dropId][piece][msg.sender] = uint32(position + 1);
        q.push(Claim(msg.sender, uint64(block.number), dep));
        emit Claimed(dropId, piece, msg.sender, uint32(position), dep);
        if (p.head == position) _startTurn(dropId, piece, d, p, msg.sender);

        IERC20(d.token).safeTransferFrom(msg.sender, address(this), dep);
    }

    // ---------------------------------------------------------------- pay

    function payWithPermit(uint256 dropId, uint16 piece, uint256 permitDeadline, uint8 v, bytes32 r, bytes32 s)
        external
    {
        Drop storage d = drops[dropId];
        try IERC20Permit(d.token).permit(msg.sender, address(this), type(uint256).max, permitDeadline, v, r, s) {} catch {}
        _pay(dropId, piece);
    }

    function pay(uint256 dropId, uint16 piece) external {
        _pay(dropId, piece);
    }

    function _pay(uint256 dropId, uint16 piece) internal {
        Drop storage d = drops[dropId];
        Piece storage p = pieces[dropId][piece];
        require(!p.sold, "sold");
        Claim[] storage q = queues[dropId][piece];
        require(p.head < q.length && q[p.head].buyer == msg.sender, "not holder");
        require(block.timestamp <= p.deadline, "too late");

        uint96 dep = q[p.head].deposit;
        p.sold = true;
        p.buyer = msg.sender;
        p.deadline = 0;
        settled[dropId][piece][msg.sender] = true;
        paidCount[msg.sender] += 1;
        emit Paid(dropId, piece, msg.sender, d.price);

        IERC20 t = IERC20(d.token);
        t.safeTransferFrom(msg.sender, d.seller, d.price - dep);
        t.safeTransfer(d.seller, dep);
    }

    // ---------------------------------------------------------------- roll

    /// @notice Anyone may call once the holder's window has passed: their deposit goes to the seller
    /// and the next claimant's turn starts.
    function advance(uint256 dropId, uint16 piece) external {
        Drop storage d = drops[dropId];
        Piece storage p = pieces[dropId][piece];
        require(!p.sold, "sold");
        Claim[] storage q = queues[dropId][piece];
        require(p.head < q.length, "no holder");
        require(block.timestamp > p.deadline, "not yet");

        address holder = q[p.head].buyer;
        uint96 dep = q[p.head].deposit;
        settled[dropId][piece][holder] = true;
        ghostCount[holder] += 1;
        p.head += 1;
        p.deadline = 0;
        emit Forfeited(dropId, piece, holder, dep);
        if (p.head < q.length) _startTurn(dropId, piece, d, p, q[p.head].buyer);

        IERC20(d.token).safeTransfer(d.seller, dep);
    }

    /// @notice Once a piece is sold, every other claimant still in escrow takes their deposit back.
    function withdraw(uint256 dropId, uint16 piece) external {
        uint32 pos = claimPos[dropId][piece][msg.sender];
        require(pos != 0 && !settled[dropId][piece][msg.sender], "nothing to withdraw");
        require(pieces[dropId][piece].sold, "not yet");
        Drop storage d = drops[dropId];
        uint96 dep = queues[dropId][piece][pos - 1].deposit;
        settled[dropId][piece][msg.sender] = true;
        emit Refunded(dropId, piece, msg.sender, dep);
        IERC20(d.token).safeTransfer(msg.sender, dep);
    }

    /// @notice The deposit this buyer puts down on this drop, priced by their record across every drop:
    /// standing = paid on time - ghosted. Strangers (0) pay the drop's deposit; +1 pays half, +2 or more a
    /// quarter; -1 pays double, -2 triple, -3 or worse four times. A fresh wallet only gets the stranger price.
    function depositFor(uint256 dropId, address buyer) public view returns (uint96) {
        Drop storage d = drops[dropId];
        uint96 base = d.deposit;
        int256 standing = int256(uint256(paidCount[buyer])) - int256(uint256(ghostCount[buyer]));
        uint96 dep;
        if (standing >= 2) dep = base / 4;
        else if (standing == 1) dep = base / 2;
        else if (standing == 0) dep = base;
        else dep = base * uint96(1 + (standing < -3 ? 3 : uint256(-standing)));
        if (dep > d.price) dep = d.price;
        return dep == 0 ? 1 : dep;
    }

    function claimed(uint256 dropId, uint16 piece, address buyer) external view returns (bool) {
        return claimPos[dropId][piece][buyer] != 0;
    }

    function _startTurn(uint256 dropId, uint16 piece, Drop storage d, Piece storage p, address buyer) internal {
        uint64 deadline = uint64(block.timestamp) + d.payWindow;
        p.deadline = deadline;
        emit TurnStarted(dropId, piece, buyer, deadline);
    }

    // ---------------------------------------------------------------- views

    function queueOf(uint256 dropId, uint16 piece) external view returns (Claim[] memory) {
        return queues[dropId][piece];
    }

    function queueLength(uint256 dropId, uint16 piece) external view returns (uint256) {
        return queues[dropId][piece].length;
    }
}
