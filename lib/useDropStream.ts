"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyStream, connectPoll, connectStream, type Snapshot, type StreamEvent } from "@/lib/stream-types";

/**
 * Subscribe to the drop's stream. `drop` may be a number, "latest" (newest room drop) or "newest" (any drop,
 * bot rounds included). With "latest"/"newest" the hook re-subscribes when a new drop is created.
 */
export function useDropStream(drop: string, onEvent?: (ev: StreamEvent) => void, canFollow?: () => boolean) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [gen, setGen] = useState(0);
  const [newer, setNewer] = useState<number | null>(null); // a newer drop we did not jump to
  const cb = useRef(onEvent);
  const can = useRef(canFollow);
  useEffect(() => {
    cb.current = onEvent;
    can.current = canFollow;
  }, [onEvent, canFollow]);
  const follow = useCallback(() => {
    setNewer(null);
    setGen((g) => g + 1);
  }, []);

  useEffect(() => {
    if (!drop) return;
    const follow = drop === "latest" || drop === "newest";
    const handlers = {
        onStatus: setConnected,
        onEvent: (ev: StreamEvent) => {
          if (follow && ev.type === "drop" && (drop === "newest" || !ev.synthetic)) {
            // a screen with a live call of dibs stays put and offers the switch instead of jumping
            if (can.current && !can.current()) setNewer(ev.id);
            else setGen((g) => g + 1); // re-subscribe: the server resolves the new drop
            return;
          }
          const localAt = Date.now();
          setSnap((s) => {
            const n = applyStream(s, ev);
            return n && (ev.type === "head" || ev.type === "snapshot") ? { ...n, head: { ...n.head, localAt } } : n;
          });
          cb.current?.(ev);
        },
      };
    // SSE first; if nothing arrives in 4 s (a proxy buffering the stream), fall back to polling.
    let got = false;
    let stop = connectStream(
      `/api/stream?drop=${encodeURIComponent(drop)}`,
      { onStatus: handlers.onStatus, onEvent: (ev) => { got = true; handlers.onEvent(ev); } },
      EventSource as unknown as Parameters<typeof connectStream>[2],
    );
    const fallback = setTimeout(() => {
      if (got) return;
      stop();
      stop = connectPoll(`/api/poll?drop=${encodeURIComponent(drop)}`, handlers);
    }, 4_000);
    return () => {
      clearTimeout(fallback);
      stop();
    };
  }, [drop, gen]);

  return { snap, connected, newer, follow };
}

/** Chain time (s) from the latest head: block timestamp + time since this screen received it. */
export function useChainClock(snap: Snapshot | null, now: number) {
  const h = snap?.head;
  return h?.ts ? h.ts + Math.max(0, now - (h.localAt ?? now)) / 1000 : now / 1000;
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
