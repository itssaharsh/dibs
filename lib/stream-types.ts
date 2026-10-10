// The SSE contract between the server and every screen, plus the one reducer both sides run.
// The server builds drop state by applying chain events; clients apply the same events to their snapshot.

export type Addr = `0x${string}`;

export type RowStatus = "waiting" | "holding" | "no-show" | "won" | "refunded";

export type ClaimRow = {
  addr: Addr;
  nick: string;
  position: number; // index in the piece's line (0 = first)
  block: number;
  txIndex: number; // position of the tx in its block
  tx: string | null; // null when rebuilt from contract views
  status: RowStatus;
};

export type PieceState = {
  index: number;
  name: string;
  size: string;
  photo: string;
  queue: ClaimRow[];
  head: number; // index of the current holder
  deadline: number; // unix seconds; 0 when nobody holds
  sold: boolean;
  buyer: Addr | null;
};

export type DropState = {
  id: number;
  seller: Addr;
  token: Addr;
  startsAt: number;
  payWindow: number;
  price: string; // tINR, whole units
  deposit: string;
  pieceCount: number;
  synthetic: boolean; // bot-round drop (short pay window)
};

export type Stats = {
  claims: number;
  firstBlock: number;
  lastBlock: number;
  spanMs: number; // server receive time of firstBlock's head → lastBlock's head
  medianSendToSeenMs: number; // send relay received → Claimed seen
  tipRefused: number;
  forfeits: number;
};

export type Snapshot = {
  drop: DropState | null;
  latestDrop: number;
  pieces: PieceState[];
  seller: { address: Addr | null; balance: string };
  stats: Stats;
  head: { block: number; receivedAt: number; baseFee: string; ts: number; localAt?: number }; // ts = block timestamp (s); localAt = when this screen got it
};

export type ChainEvent =
  | { type: "claimed"; drop: number; piece: number; row: ClaimRow }
  | { type: "turn"; drop: number; piece: number; index: number; addr: Addr; deadline: number }
  | { type: "paid"; drop: number; piece: number; addr: Addr; amount: string; tx: string | null }
  | { type: "forfeited"; drop: number; piece: number; addr: Addr; amount: string; tx: string | null }
  | { type: "refunded"; drop: number; piece: number; addr: Addr; amount: string; tx: string | null };

export type StreamEvent =
  | { type: "snapshot"; data: Snapshot }
  | { type: "head"; block: number; receivedAt: number; baseFee: string; ts: number }
  | { type: "drop"; id: number; synthetic: boolean } // a new drop was created
  | { type: "stats"; drop: number; stats: Stats }
  | { type: "seller"; drop: number; balance: string }
  | { type: "bots"; drop: number; phase: string; done: number; total: number; note?: string }
  | ChainEvent;

export const emptyStats = (): Stats => ({
  claims: 0,
  firstBlock: 0,
  lastBlock: 0,
  spanMs: 0,
  medianSendToSeenMs: 0,
  tipRefused: 0,
  forfeits: 0,
});

/** Apply one chain event to a piece list (pure; returns new arrays for React). */
export function applyEvent(pieces: PieceState[], ev: ChainEvent): PieceState[] {
  return pieces.map((p) => {
    if (p.index !== ev.piece) return p;
    const queue = [...p.queue];
    const setStatus = (addr: Addr, status: RowStatus) => {
      const i = queue.findIndex((r) => r.addr.toLowerCase() === addr.toLowerCase());
      if (i >= 0) queue[i] = { ...queue[i], status };
    };
    switch (ev.type) {
      case "claimed": {
        if (queue.some((r) => r.position === ev.row.position)) return p; // duplicate delivery
        queue.push(ev.row);
        queue.sort((a, b) => a.position - b.position);
        return { ...p, queue };
      }
      case "turn": {
        const i = queue.findIndex((r) => r.position === ev.index);
        if (i >= 0) queue[i] = { ...queue[i], status: "holding" };
        return { ...p, queue, head: ev.index, deadline: ev.deadline };
      }
      case "paid":
        setStatus(ev.addr, "won");
        return { ...p, queue, sold: true, buyer: ev.addr, deadline: 0 };
      case "forfeited": {
        setStatus(ev.addr, "no-show");
        const forfeitedAt = queue.findIndex((r) => r.addr.toLowerCase() === ev.addr.toLowerCase());
        return { ...p, queue, head: Math.max(p.head, forfeitedAt + 1), deadline: 0 };
      }
      case "refunded":
        setStatus(ev.addr, "refunded");
        return { ...p, queue };
    }
  });
}

export const holderOf = (p: PieceState): ClaimRow | null =>
  !p.sold && p.head < p.queue.length && p.deadline > 0 ? p.queue[p.head] : null;

export const mineIn = (p: PieceState, me: string | null | undefined): ClaimRow | null =>
  me ? p.queue.find((r) => r.addr.toLowerCase() === me.toLowerCase()) ?? null : null;

export const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** Parse one SSE `data:` payload. */
export const parseStreamEvent = (data: string): StreamEvent | null => {
  try {
    return JSON.parse(data) as StreamEvent;
  } catch {
    return null;
  }
};

/** Client-side: fold one stream event into the current snapshot. */
export function applyStream(s: Snapshot | null, ev: StreamEvent): Snapshot | null {
  if (ev.type === "snapshot") return ev.data;
  if (!s) return s;
  switch (ev.type) {
    case "head":
      return { ...s, head: { block: ev.block, receivedAt: ev.receivedAt, baseFee: ev.baseFee, ts: ev.ts } };
    case "drop":
      return { ...s, latestDrop: Math.max(s.latestDrop, ev.id) };
    case "stats":
      return s.drop && ev.drop === s.drop.id ? { ...s, stats: ev.stats } : s;
    case "seller":
      return s.drop && ev.drop === s.drop.id ? { ...s, seller: { ...s.seller, balance: ev.balance } } : s;
    case "bots":
      return s;
    default:
      return s.drop && ev.drop === s.drop.id ? { ...s, pieces: applyEvent(s.pieces, ev) } : s;
  }
}

type ESLike = { onopen: (() => void) | null; onmessage: ((m: { data: string }) => void) | null; onerror: (() => void) | null; close(): void };

/** Subscribe to /api/stream; on any drop, close and re-open after `retryMs` (the server re-sends a snapshot). */
export function connectStream(
  url: string,
  h: { onEvent: (ev: StreamEvent) => void; onStatus: (connected: boolean) => void },
  ES: new (url: string) => ESLike,
  retryMs = 2_000,
): () => void {
  let es: ESLike | null = null;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const open = () => {
    es = new ES(url);
    es.onopen = () => h.onStatus(true);
    es.onmessage = (m) => {
      const ev = parseStreamEvent(m.data);
      if (ev) {
        if (ev.type === "snapshot") h.onStatus(true);
        h.onEvent(ev);
      }
    };
    es.onerror = () => {
      h.onStatus(false);
      es?.close();
      if (!closed) timer = setTimeout(open, retryMs);
    };
  };
  open();
  return () => {
    closed = true;
    clearTimeout(timer);
    es?.close();
  };
}
