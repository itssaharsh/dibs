import { afterEach, describe, expect, it, vi } from "vitest";
import { applyStream, connectStream, emptyStats, type Snapshot, type StreamEvent } from "@/lib/stream-types";

class FakeES {
  static all: FakeES[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeES.all.push(this);
  }
  close() {
    this.closed = true;
  }
  push(ev: StreamEvent) {
    this.onmessage?.({ data: JSON.stringify(ev) });
  }
}

const snap = (block: number): Snapshot => ({
  drop: null, latestDrop: 1, pieces: [], seller: { address: null, balance: "0" }, stats: emptyStats(),
  head: { block, receivedAt: 0, baseFee: "0", ts: 0 },
});

describe("AC-9 stream-reconnect", () => {
  afterEach(() => vi.useRealTimers());

  it("re-subscribes after a dropped connection and takes the fresh snapshot", () => {
    vi.useFakeTimers();
    FakeES.all = [];
    let state: Snapshot | null = null;
    const status: boolean[] = [];
    const stop = connectStream(
      "/api/stream?drop=1",
      { onEvent: (ev) => (state = applyStream(state, ev)), onStatus: (c) => status.push(c) },
      FakeES,
      2_000,
    );
    FakeES.all[0].push({ type: "snapshot", data: snap(10) });
    expect(state!.head.block).toBe(10);

    FakeES.all[0].onerror?.(); // server went away
    expect(FakeES.all[0].closed).toBe(true);
    expect(status.at(-1)).toBe(false);
    vi.advanceTimersByTime(2_000);
    expect(FakeES.all).toHaveLength(2);

    FakeES.all[1].push({ type: "snapshot", data: snap(42) });
    expect(state!.head.block).toBe(42);
    expect(status.at(-1)).toBe(true);
    stop();
    expect(FakeES.all[1].closed).toBe(true);
  });
});
