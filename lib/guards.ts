// Pure request guards for the send relay (unit-tested).
import { parseTransaction, type Hex } from "viem";

export const MAX_BODY = 4 * 1024;
export const RATE_N = 5;
export const RATE_WINDOW_MS = 10_000;

export type GuardResult = { ok: true; to: Hex } | { ok: false; status: number; error: string };

export function checkRawTx(raw: unknown, allowed: string[], chainId = 10143): GuardResult {
  if (typeof raw !== "string" || !/^0x[0-9a-fA-F]+$/.test(raw)) return { ok: false, status: 400, error: "raw must be a hex string" };
  let tx;
  try {
    tx = parseTransaction(raw as Hex);
  } catch {
    return { ok: false, status: 400, error: "not a signed transaction" };
  }
  if (tx.chainId !== chainId) return { ok: false, status: 400, error: "wrong chain" };
  if (!tx.to || !allowed.some((a) => a.toLowerCase() === tx.to!.toLowerCase()))
    return { ok: false, status: 400, error: "only DropHouse and tINR transactions are relayed" };
  if (tx.value && tx.value > 0n) return { ok: false, status: 400, error: "native value transfers are not relayed" };
  return { ok: true, to: tx.to };
}

/** Sliding-window limiter: ≤ RATE_N per key per RATE_WINDOW_MS. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private n = RATE_N, private windowMs = RATE_WINDOW_MS) {}
  allow(key: string, now = Date.now()): boolean {
    const k = key.toLowerCase();
    const recent = (this.hits.get(k) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.n) {
      this.hits.set(k, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(k, recent);
    return true;
  }
}

/** Fund each address once; concurrent calls for the same address share one promise. */
export class FundOnce<T> {
  private done = new Map<string, Promise<T>>();
  constructor(private fundFn: (addr: string) => Promise<T>) {}
  has(addr: string) {
    return this.done.has(addr.toLowerCase());
  }
  get size() {
    return this.done.size;
  }
  run(addr: string): { promise: Promise<T>; already: boolean } {
    const k = addr.toLowerCase();
    const prev = this.done.get(k);
    if (prev) return { promise: prev, already: true };
    const p = this.fundFn(k).catch((e) => {
      this.done.delete(k); // a failed funding may be retried
      throw e;
    });
    this.done.set(k, p);
    return { promise: p, already: false };
  }
}
