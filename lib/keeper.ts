import { GAS } from "@/lib/chain";
import type { Indexer } from "@/lib/indexer";
import type { Operator } from "@/lib/operator";
import { holderOf, type PieceState } from "@/lib/stream-types";

/** Pieces whose holder's window has passed (contract: block.timestamp > deadline). */
export function lapsed(pieces: PieceState[], nowSec: number): PieceState[] {
  return pieces.filter((p) => {
    const h = holderOf(p);
    return h !== null && nowSec > p.deadline;
  });
}

/** Calls advance() once per lapsed holder; retries every 2 s; "not yet" reverts are harmless. */
export class Keeper {
  private tried = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  advances = 0;
  constructor(private ix: Indexer, private op: Operator, private estimate?: (drop: number, piece: number) => Promise<bigint>) {}

  start() {
    this.timer ??= setInterval(() => void this.tick(), 500);
  }

  async tick(now = Date.now(), chainSec?: number) {
    const nowSec = Math.floor(chainSec ?? (this.ix.chainNow ? this.ix.chainNow() : now / 1000));
    for (const [id, e] of this.ix.drops) {
      for (const p of lapsed(e.pieces, nowSec)) {
        const key = `${id}:${p.index}:${p.head}`;
        const last = this.tried.get(key) ?? 0;
        if (now - last < 2_000) continue;
        this.tried.set(key, now);
        this.op.baseFee = BigInt(this.ix.head.baseFee);
        // gas is charged on the limit: estimate when the node allows it, never above the fixed cap
        const gas = this.estimate ? await this.estimate(id, p.index).then((g) => (g * 12n / 10n < GAS.advance ? g * 12n / 10n : GAS.advance)).catch(() => GAS.advance) : GAS.advance;
        this.op
          .call("advance", [BigInt(id), p.index], gas)
          .then(() => this.advances++)
          .catch((err) => console.error("keeper: advance", id, p.index, String(err).slice(0, 120)));
      }
    }
  }
}

const g = globalThis as unknown as { __dibsKeeper?: Keeper };

export async function startKeeper() {
  const { getIndexer } = await import("@/lib/indexer");
  const { getOperator } = await import("@/lib/operator");
  const op = getOperator();
  if (!op || g.__dibsKeeper) return;
  const { encodeFunctionData } = await import("viem");
  const { addresses, publicClient } = await import("@/lib/chain");
  const { dropHouseAbi } = await import("@/lib/operator");
  g.__dibsKeeper = new Keeper(getIndexer(), op, (drop, piece) =>
    publicClient().estimateGas({
      account: op.address,
      to: addresses.dropHouse,
      data: encodeFunctionData({ abi: dropHouseAbi, functionName: "advance", args: [BigInt(drop), piece] }),
    }),
  );
  g.__dibsKeeper.start();
}
