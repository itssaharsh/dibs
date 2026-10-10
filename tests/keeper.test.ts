import { describe, expect, it, vi } from "vitest";
import { GAS } from "@/lib/chain";
import { Keeper, lapsed } from "@/lib/keeper";
import type { PieceState } from "@/lib/stream-types";

const p = (over: Partial<PieceState>): PieceState => ({
  index: 0, name: "", size: "", photo: "", head: 0, deadline: 100, sold: false, buyer: null,
  queue: [{ addr: "0x0000000000000000000000000000000000000001", nick: "", position: 0, block: 1, txIndex: 0, tx: null, status: "holding", deposit: "50" }],
  ...over,
});

describe("keeper (AC-3 live path)", () => {
  it("finds only holders whose window has passed", () => {
    expect(lapsed([p({})], 101)).toHaveLength(1);
    expect(lapsed([p({})], 100)).toHaveLength(0); // contract needs block.timestamp > deadline
    expect(lapsed([p({ sold: true })], 200)).toHaveLength(0);
    expect(lapsed([p({ deadline: 0 })], 200)).toHaveLength(0);
    expect(lapsed([p({ head: 1 })], 200)).toHaveLength(0);
  });

  it("calls advance once per lapsed holder and waits 2 s before retrying", async () => {
    const call = vi.fn(async () => "0xhash");
    const ix = { drops: new Map([[7, { pieces: [p({ index: 1 })] }]]), head: { baseFee: "100000000000" } };
    const k = new Keeper(ix as never, { call, baseFee: 0n } as never);
    await k.tick(101_000, 101);
    await k.tick(101_500, 101.5);
    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0]).toEqual(["advance", [7n, 1], GAS.advance]);
    await k.tick(103_100, 103.1);
    expect(call).toHaveBeenCalledTimes(2);
  });
});
