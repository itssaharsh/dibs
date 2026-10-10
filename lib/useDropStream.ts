"use client";
import { useEffect, useRef, useState } from "react";
import { applyStream, connectStream, type Snapshot, type StreamEvent } from "@/lib/stream-types";

/**
 * Subscribe to the drop's stream. `drop` may be a number, "latest" (newest room drop) or "newest" (any drop,
 * bot rounds included). With "latest"/"newest" the hook re-subscribes when a new drop is created.
 */
export function useDropStream(drop: string, onEvent?: (ev: StreamEvent) => void) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [gen, setGen] = useState(0);
  const cb = useRef(onEvent);
  useEffect(() => {
    cb.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!drop) return;
    const follow = drop === "latest" || drop === "newest";
    const stop = connectStream(
      `/api/stream?drop=${encodeURIComponent(drop)}`,
      {
        onStatus: setConnected,
        onEvent: (ev) => {
          if (follow && ev.type === "drop" && (drop === "newest" || !ev.synthetic)) {
            setGen((g) => g + 1); // re-subscribe: the server resolves the new drop
            return;
          }
          setSnap((s) => applyStream(s, ev));
          cb.current?.(ev);
        },
      },
      EventSource as unknown as Parameters<typeof connectStream>[2],
    );
    return stop;
  }, [drop, gen]);

  return { snap, connected };
}

/** Chain time (s) from the latest head: block timestamp + time since this screen received it. */
export function useChainClock(snap: Snapshot | null, now: number) {
  const ref = useRef<{ block: number; ts: number; at: number }>({ block: 0, ts: 0, at: 0 });
  const h = snap?.head;
  if (h && h.ts && h.block !== ref.current.block) ref.current = { block: h.block, ts: h.ts, at: Date.now() };
  const r = ref.current;
  return r.ts ? r.ts + Math.max(0, now - r.at) / 1000 : now / 1000;
}

/** A clock that ticks every `ms` (for countdowns). */
export function useNow(ms = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export const fmtClock = (secs: number) => {
  const s = Math.max(0, Math.ceil(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const fmtNum = (n: number | string) => Number(n).toLocaleString("en-US");
