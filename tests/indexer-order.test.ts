import { describe, expect, it } from "vitest";
import { applyEvent, holderOf, type ClaimRow, type PieceState } from "@/lib/stream-types";

const piece = (): PieceState => ({ index: 0, name: "Denim jacket", size: "M", photo: "", queue: [], head: 0, deadline: 0, sold: false, buyer: null });
const row = (n: number, block: number, txIndex: number): ClaimRow => ({
  addr: `0x${String(n).padStart(40, "0")}`, nick: `n${n}`, position: n, block, txIndex, tx: `0x${n}`, status: "waiting", deposit: "50",
});

describe("indexer-order: the line follows chain order", () => {
  it("orders rows by position (block, then position in block), ignores duplicates", () => {
    let ps = [piece()];
    ps = applyEvent(ps, { type: "claimed", drop: 1, piece: 0, row: row(1, 101, 0) });
    ps = applyEvent(ps, { type: "claimed", drop: 1, piece: 0, row: row(0, 100, 3) });
    ps = applyEvent(ps, { type: "claimed", drop: 1, piece: 0, row: row(2, 101, 4) });
    ps = applyEvent(ps, { type: "claimed", drop: 1, piece: 0, row: row(2, 101, 4) });
    expect(ps[0].queue.map((r) => r.position)).toEqual([0, 1, 2]);
    expect(ps[0].queue.map((r) => r.block)).toEqual([100, 101, 101]);
  });

  it("rolls the holder on forfeit and marks the sale", () => {
    let ps = [piece()];
    for (const r of [row(0, 100, 0), row(1, 100, 1), row(2, 101, 0)])
      ps = applyEvent(ps, { type: "claimed", drop: 1, piece: 0, row: r });
    ps = applyEvent(ps, { type: "turn", drop: 1, piece: 0, index: 0, addr: row(0, 0, 0).addr, deadline: 1000 });
    expect(holderOf(ps[0])?.position).toBe(0);
    ps = applyEvent(ps, { type: "forfeited", drop: 1, piece: 0, addr: row(0, 0, 0).addr, amount: "50", tx: null });
    ps = applyEvent(ps, { type: "turn", drop: 1, piece: 0, index: 1, addr: row(1, 0, 0).addr, deadline: 1060 });
    expect(ps[0].queue[0].status).toBe("no-show");
    expect(ps[0].deadline).toBe(1060);
    expect(holderOf(ps[0])?.position).toBe(1);
    ps = applyEvent(ps, { type: "paid", drop: 1, piece: 0, addr: row(1, 0, 0).addr, amount: "450", tx: null });
    expect(ps[0].sold).toBe(true);
    expect(ps[0].queue[1].status).toBe("won");
    expect(holderOf(ps[0])).toBeNull();
    ps = applyEvent(ps, { type: "refunded", drop: 1, piece: 0, addr: row(2, 0, 0).addr, amount: "50", tx: null });
    expect(ps[0].queue[2].status).toBe("refunded");
  });
});

describe("indexer-order: event order inside one advance() tx", () => {
  it("keeps the new holder's deadline if forfeited is applied after the next turn", () => {
    let ps = [piece()];
    for (const r of [row(0, 100, 0), row(1, 100, 1)]) ps = applyEvent(ps, { type: "claimed", drop: 1, piece: 0, row: r });
    ps = applyEvent(ps, { type: "turn", drop: 1, piece: 0, index: 0, addr: row(0, 0, 0).addr, deadline: 1000 });
    ps = applyEvent(ps, { type: "turn", drop: 1, piece: 0, index: 1, addr: row(1, 0, 0).addr, deadline: 1060 });
    ps = applyEvent(ps, { type: "forfeited", drop: 1, piece: 0, addr: row(0, 0, 0).addr, amount: "50", tx: null });
    expect(ps[0].head).toBe(1);
    expect(ps[0].deadline).toBe(1060);
    expect(holderOf(ps[0])?.position).toBe(1);
  });
});
