import { decodeEventLog, formatEther, type Hex } from "viem";
import seed from "@/seed/drop.json";
import { addresses, publicClient, rpcWsUrl } from "@/lib/chain";
import { nick } from "@/lib/nick";
import { dropHouseAbi, tokenAbi } from "@/lib/operator";
import {
  applyEvent,
  emptyStats,
  median,
  type Addr,
  type ChainEvent,
  type ClaimRow,
  type DropState,
  type PieceState,
  type Snapshot,
  type Stats,
  type StreamEvent,
} from "@/lib/stream-types";

const BOT_WINDOW_MAX = 10; // drops with a pay window under 10 s are bot rounds (synthetic)
const OVERLAP = 5; // re-scan the last few blocks: providers behind a load balancer can lag a block or two

type DropEntry = {
  drop: DropState;
  pieces: PieceState[];
  stats: Stats;
  latencies: number[];
  sellerBalance: bigint;
};

export function pieceMeta(index: number, synthetic: boolean) {
  const list = seed.pieces;
  const m = list[(synthetic ? index + 1 : index) % list.length];
  return { name: m.name, size: m.size, photo: m.photo };
}

const emptyPiece = (index: number, synthetic: boolean): PieceState => ({
  index,
  ...pieceMeta(index, synthetic),
  queue: [],
  head: 0,
  deadline: 0,
  sold: false,
  buyer: null,
});

export class Indexer {
  drops = new Map<number, DropEntry>();
  latestDrop = 0;
  lastScanned = 0n;
  head = { block: 0, receivedAt: 0, baseFee: "100000000000", ts: 0 };
  headTimes = new Map<number, number>();
  seen = new Set<string>();
  listeners = new Set<(ev: StreamEvent) => void>();
  sendTimes = new Map<string, number>();
  tipRefused = new Map<number, number>();
  rpcErrors = 0;
  wsHeads = 0;
  ready: Promise<void>;
  private scanning = false;
  private rescan = false;
  private lastHeadAt = 0;
  private ticks = 0;

  constructor() {
    this.ready = this.boot();
  }

  private async boot() {
    const c = publicClient();
    const at = await c.getBlockNumber();
    const count = Number(
      await c.readContract({ address: addresses.dropHouse, abi: dropHouseAbi, functionName: "dropCount", blockNumber: at }),
    );
    this.latestDrop = count;
    for (let id = Math.max(1, count - 5); id <= count; id++) {
      try {
        await this.loadFromViews(id, at);
      } catch (e) {
        this.rpcErrors++;
        console.error("indexer: load drop", id, e);
      }
    }
    this.lastScanned = at;
    const bootBlock = await c.getBlock({ blockNumber: at });
    this.head = { ...this.head, block: Number(at), receivedAt: Date.now(), ts: Number(bootBlock.timestamp) };
    this.startHeads();
    setInterval(() => void this.tick(), 1_000);
  }

  /** Rebuild a drop from contract state at block `at` (restart path; no tx hashes for old claims). */
  private async loadFromViews(id: number, at: bigint) {
    const c = publicClient();
    const read = (functionName: string, args: unknown[]) =>
      c.readContract({ address: addresses.dropHouse, abi: dropHouseAbi, functionName: functionName as "drops", args: args as [bigint], blockNumber: at });
    const [seller, token, startsAt, payWindow, price, deposit, pieceCount] = (await read("drops", [BigInt(id)])) as unknown as [
      Addr, Addr, bigint, number, bigint, bigint, number,
    ];
    if (/^0x0+$/.test(seller)) return;
    const drop: DropState = {
      id,
      seller,
      token,
      startsAt: Number(startsAt),
      payWindow: Number(payWindow),
      price: formatEther(price),
      deposit: formatEther(deposit),
      pieceCount: Number(pieceCount),
      synthetic: Number(payWindow) < BOT_WINDOW_MAX,
    };
    const pieces: PieceState[] = [];
    for (let i = 0; i < drop.pieceCount; i++) {
      const [head, deadline, sold, buyer] = (await read("pieces", [BigInt(id), i])) as unknown as [number, bigint, boolean, Addr];
      const q = (await read("queueOf", [BigInt(id), i])) as unknown as { buyer: Addr; blockNumber: bigint }[];
      const queue: ClaimRow[] = [];
      for (let k = 0; k < q.length; k++) {
        let status: ClaimRow["status"] = "waiting";
        if (k < head) status = "no-show";
        else if (k === head && sold) status = "won";
        else if (k === head && Number(deadline) > 0) status = "holding";
        else if (sold) {
          const settled = (await read("settled", [BigInt(id), i, q[k].buyer])) as unknown as boolean;
          if (settled) status = "refunded";
        }
        queue.push({ addr: q[k].buyer, nick: nick(q[k].buyer), position: k, block: Number(q[k].blockNumber), txIndex: -1, tx: null, status });
      }
      pieces.push({ ...emptyPiece(i, drop.synthetic), queue, head: Number(head), deadline: Number(deadline), sold, buyer: sold ? buyer : null });
    }
    const entry: DropEntry = { drop, pieces, stats: emptyStats(), latencies: [], sellerBalance: 0n };
    this.recount(entry);
    this.drops.set(id, entry);
    void this.refreshSeller(entry);
  }

  private async refreshSeller(entry: DropEntry) {
    try {
      entry.sellerBalance = (await publicClient().readContract({
        address: entry.drop.token, abi: tokenAbi, functionName: "balanceOf", args: [entry.drop.seller],
      })) as bigint;
      this.emit({ type: "seller", drop: entry.drop.id, balance: formatEther(entry.sellerBalance) });
    } catch {
      this.rpcErrors++;
    }
  }

  /** Raw WebSocket: newHeads for the block counter, logs for claims the moment they land. */
  private startHeads() {
    const WS = (globalThis as unknown as { WebSocket?: typeof WebSocket }).WebSocket;
    if (!WS) return;
    let ws: WebSocket;
    const connect = () => {
      ws = new WS(rpcWsUrl());
      const subs = new Map<string, "heads" | "logs">();
      ws.onopen = () => {
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_subscribe", params: ["newHeads"] }));
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_subscribe", params: ["logs", { address: addresses.dropHouse }] }));
      };
      ws.onmessage = (m) => {
        let msg: { id?: number; result?: unknown; params?: { subscription: string; result: Record<string, string> } };
        try {
          msg = JSON.parse(String(m.data));
        } catch {
          return;
        }
        if (msg.id === 1 && typeof msg.result === "string") subs.set(msg.result, "heads");
        if (msg.id === 2 && typeof msg.result === "string") subs.set(msg.result, "logs");
        const p = msg.params;
        if (!p?.result) return;
        const kind = subs.get(p.subscription);
        if (kind === "heads" && p.result.number) {
          this.wsHeads++;
          this.onHead(Number(BigInt(p.result.number)), BigInt(p.result.baseFeePerGas ?? "100000000000"), Number(BigInt(p.result.timestamp ?? "0")));
        } else if (kind === "logs") {
          this.onRawLog(p.result);
        }
      };
      ws.onerror = () => {
        this.rpcErrors++;
      };
      ws.onclose = () => setTimeout(connect, 1_000);
    };
    connect();
  }

  private onRawLog(l: Record<string, string>) {
    try {
      const ev = decodeEventLog({ abi: dropHouseAbi, data: l.data as Hex, topics: l.topics as unknown as [Hex, ...Hex[]] });
      this.handle({
        eventName: String(ev.eventName),
        args: ev.args as unknown as Record<string, unknown>,
        blockNumber: BigInt(l.blockNumber),
        logIndex: Number(BigInt(l.logIndex)),
        transactionIndex: Number(BigInt(l.transactionIndex)),
        transactionHash: l.transactionHash as Hex,
      });
    } catch (e) {
      console.error("indexer: ws log", (e as Error).message?.slice(0, 120));
    }
  }

  /** Every second: HTTP head if the socket is quiet; every 3 s: backstop log scan over HTTP. */
  private async tick() {
    this.ticks++;
    if (Date.now() - this.lastHeadAt >= 1_500) {
      try {
        const b = await publicClient().getBlock();
        this.onHead(Number(b.number), b.baseFeePerGas ?? 100_000_000_000n, Number(b.timestamp));
      } catch {
        this.rpcErrors++;
      }
    }
    if (this.ticks % 3 === 0) void this.scan();
  }

  /** Chain time in seconds: the last head's block timestamp plus the time since it arrived. */
  chainNow(): number {
    if (!this.head.ts) return Date.now() / 1000;
    return this.head.ts + (Date.now() - this.head.receivedAt) / 1000;
  }

  private onHead(block: number, baseFee: bigint, ts: number) {
    this.lastHeadAt = Date.now();
    if (block <= this.head.block) return;
    const receivedAt = Date.now();
    this.headTimes.set(block, receivedAt);
    if (this.headTimes.size > 5_000) {
      const cut = block - 4_000;
      for (const k of this.headTimes.keys()) if (k < cut) this.headTimes.delete(k);
    }
    this.head = { block, receivedAt, baseFee: baseFee.toString(), ts };
    this.emit({ type: "head", block, receivedAt, baseFee: baseFee.toString(), ts });
  }

  private async scan() {
    if (this.scanning) {
      this.rescan = true;
      return;
    }
    this.scanning = true;
    try {
      do {
        this.rescan = false;
        const t0 = Date.now();
        const to = (await publicClient().getBlockNumber()) - 1n;
        let from = this.lastScanned + 1n - BigInt(OVERLAP);
        if (from < addresses.deployBlock) from = addresses.deployBlock;
        while (from <= to) {
          const end = from + 99n < to ? from + 99n : to;
          const logs = await publicClient().getContractEvents({
            address: addresses.dropHouse, abi: dropHouseAbi, fromBlock: from, toBlock: end,
          });
          logs.sort((a, b) => Number(a.blockNumber - b.blockNumber) || (a.logIndex ?? 0) - (b.logIndex ?? 0));
          for (const log of logs) this.handle(log as unknown as RawLog);
          from = end + 1n;
        }
        if (to > this.lastScanned) this.lastScanned = to;
        if (Date.now() - t0 > 3_000) console.warn(`indexer: slow scan ${Date.now() - t0} ms`);
      } while (this.rescan);
    } catch (e) {
      this.rpcErrors++;
      console.error("indexer: scan", (e as Error).message?.slice(0, 200));
    } finally {
      this.scanning = false;
    }
  }

  private handle(log: RawLog) {
    const key = `${log.transactionHash}:${log.logIndex}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    const a = log.args;
    const id = Number(a.dropId);
    if (log.eventName === "DropCreated") {
      if (this.drops.has(id)) return;
      const payWindow = Number(a.payWindow);
      const drop: DropState = {
        id,
        seller: a.seller as Addr,
        token: addresses.token,
        startsAt: Number(a.startsAt),
        payWindow,
        price: formatEther(a.price as bigint),
        deposit: formatEther(a.deposit as bigint),
        pieceCount: Number(a.pieces),
        synthetic: payWindow < BOT_WINDOW_MAX,
      };
      const entry: DropEntry = {
        drop,
        pieces: Array.from({ length: drop.pieceCount }, (_, i) => emptyPiece(i, drop.synthetic)),
        stats: emptyStats(),
        latencies: [],
        sellerBalance: 0n,
      };
      this.drops.set(id, entry);
      this.latestDrop = Math.max(this.latestDrop, id);
      this.emit({ type: "drop", id, synthetic: drop.synthetic });
      void this.refreshSeller(entry);
      return;
    }
    const entry = this.drops.get(id);
    if (!entry) return;
    const piece = Number(a.piece);
    const addr = a.buyer as Addr;
    const tx = log.transactionHash;
    let ev: ChainEvent;
    switch (log.eventName) {
      case "Claimed": {
        const row: ClaimRow = {
          addr, nick: nick(addr), position: Number(a.position), block: Number(log.blockNumber), txIndex: log.transactionIndex, tx, status: "waiting",
        };
        ev = { type: "claimed", drop: id, piece, row };
        const sent = this.sendTimes.get(tx.toLowerCase());
        if (sent) entry.latencies.push(Date.now() - sent);
        break;
      }
      case "TurnStarted": {
        const p = entry.pieces[piece];
        const row = p?.queue.find((r) => r.addr.toLowerCase() === addr.toLowerCase());
        ev = { type: "turn", drop: id, piece, index: row ? row.position : p.head, addr, deadline: Number(a.deadline) };
        break;
      }
      case "Paid":
        ev = { type: "paid", drop: id, piece, addr, amount: formatEther(a.amount as bigint), tx };
        entry.sellerBalance += a.amount as bigint;
        break;
      case "Forfeited":
        ev = { type: "forfeited", drop: id, piece, addr, amount: formatEther(a.amount as bigint), tx };
        entry.sellerBalance += a.amount as bigint;
        break;
      case "Refunded":
        ev = { type: "refunded", drop: id, piece, addr, amount: formatEther(a.amount as bigint), tx };
        break;
      default:
        return;
    }
    if (!entry.pieces[piece]) return;
    entry.pieces = applyEvent(entry.pieces, ev);
    this.emit(ev);
    if (ev.type === "paid" || ev.type === "forfeited") {
      // the seller is the same operator across drops: every drop's balance view moves
      for (const other of this.drops.values()) {
        if (other !== entry && other.drop.seller.toLowerCase() === entry.drop.seller.toLowerCase()) other.sellerBalance = entry.sellerBalance;
      }
      this.emit({ type: "seller", drop: id, balance: formatEther(entry.sellerBalance) });
    }
    if (ev.type === "claimed" || ev.type === "forfeited") {
      this.recount(entry);
      this.emit({ type: "stats", drop: id, stats: entry.stats });
    }
  }

  recount(entry: DropEntry) {
    const rows = entry.pieces.flatMap((p) => p.queue);
    const blocks = rows.map((r) => r.block);
    const firstBlock = blocks.length ? Math.min(...blocks) : 0;
    const lastBlock = blocks.length ? Math.max(...blocks) : 0;
    const t0 = this.headTimes.get(firstBlock);
    const t1 = this.headTimes.get(lastBlock);
    entry.stats = {
      claims: rows.length,
      firstBlock,
      lastBlock,
      spanMs: t0 && t1 ? t1 - t0 : entry.stats.spanMs,
      medianSendToSeenMs: median(entry.latencies),
      tipRefused: this.tipRefused.get(entry.drop.id) ?? 0,
      forfeits: rows.filter((r) => r.status === "no-show").length,
    };
  }

  noteSend(hash: string) {
    this.sendTimes.set(hash.toLowerCase(), Date.now());
    if (this.sendTimes.size > 5_000) this.sendTimes.delete(this.sendTimes.keys().next().value as string);
  }

  noteTipRefused(dropId: number) {
    this.tipRefused.set(dropId, (this.tipRefused.get(dropId) ?? 0) + 1);
    const entry = this.drops.get(dropId);
    if (entry) {
      this.recount(entry);
      this.emit({ type: "stats", drop: dropId, stats: entry.stats });
    }
  }

  resolveDrop(param: string | null): number {
    const n = Number(param);
    if (param && param !== "latest" && Number.isFinite(n) && n > 0) return n;
    // "latest": the newest drop that isn't a bot round, else the newest; "newest": any drop
    const ids = [...this.drops.keys()].sort((a, b) => b - a);
    if (param === "newest") return ids[0] ?? this.latestDrop;
    return ids.find((i) => !this.drops.get(i)!.drop.synthetic) ?? ids[0] ?? this.latestDrop;
  }

  snapshot(dropId: number): Snapshot {
    const e = this.drops.get(dropId);
    return {
      drop: e?.drop ?? null,
      latestDrop: this.latestDrop,
      pieces: e?.pieces ?? [],
      seller: { address: e?.drop.seller ?? null, balance: formatEther(e?.sellerBalance ?? 0n) },
      stats: e?.stats ?? emptyStats(),
      head: this.head,
    };
  }

  subscribe(fn: (ev: StreamEvent) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(ev: StreamEvent) {
    for (const fn of this.listeners) {
      try {
        fn(ev);
      } catch {
        /* a broken client must not stop the others */
      }
    }
  }
}

type RawLog = {
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: bigint;
  logIndex: number;
  transactionIndex: number;
  transactionHash: Hex;
};

const g = globalThis as unknown as { __dibsIndexer?: Indexer };

export function getIndexer(): Indexer {
  g.__dibsIndexer ??= new Indexer();
  return g.__dibsIndexer;
}
