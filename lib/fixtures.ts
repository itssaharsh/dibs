// ?state= fixtures: render any screen state without the chain (demo + e2e). Labelled data, never shown as live.
import seed from "@/seed/drop.json";
import { nick } from "@/lib/nick";
import { emptyStats, type Addr, type ClaimRow, type PieceState, type Snapshot } from "@/lib/stream-types";

const addr = (i: number) => `0x${(0xd1b5000 + i).toString(16).padStart(40, "0")}` as Addr;
export const FIXTURE_ME = addr(3);

export function fixtureSnapshot(opts: { claims?: number; head?: number; sold?: boolean; startsIn?: number; noShows?: number } = {}): Snapshot {
  const now = Math.floor(Date.now() / 1000);
  const n = opts.claims ?? 47;
  const head = opts.head ?? 0;
  const base = 41_233_019;
  const rows = (count: number, h: number, sold: boolean): ClaimRow[] =>
    Array.from({ length: count }, (_, i) => ({
      addr: addr(i), nick: nick(addr(i)), position: i, block: base + Math.floor(i / 16), txIndex: i % 16,
      tx: `0x${"ab".repeat(31)}${(i % 256).toString(16).padStart(2, "0")}`,
      status: i < h ? "no-show" : i === h ? (sold ? "won" : "holding") : "waiting",
      deposit: i % 7 === 2 ? "100" : i % 5 === 1 ? "25" : "50",
    }));
  const pieces: PieceState[] = seed.pieces.map((m, i) => {
    const count = i === 0 ? n : i === 1 ? 18 : 9;
    const sold = i === 0 ? !!opts.sold : i === 2;
    const h = i === 0 ? head : 0;
    return {
      index: i, name: m.name, size: m.size, photo: m.photo, queue: count ? rows(count, h, sold) : [],
      head: h, deadline: sold || !count ? 0 : now + 52, sold, buyer: sold ? addr(h) : null,
    };
  });
  return {
    drop: { id: 1, seller: addr(999), token: addr(998), startsAt: now + (opts.startsIn ?? -30), payWindow: 60, price: "450", deposit: "50", pieceCount: 3, synthetic: false },
    latestDrop: 1,
    pieces,
    seller: { address: addr(999), balance: String(1250 + 50 * (opts.noShows ?? head)) },
    stats: { ...emptyStats(), claims: n + 27, firstBlock: base, lastBlock: base + 2, spanMs: 640, medianSendToSeenMs: 910, forfeits: head },
    head: { block: base + 12, receivedAt: Date.now(), baseFee: "100000000000", ts: now },
  };
}
