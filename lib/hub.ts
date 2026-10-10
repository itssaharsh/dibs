import type { StreamEvent } from "@/lib/stream-types";

/** Which events a client subscribed to `drop` should receive. */
export function wants(drop: number, ev: StreamEvent): boolean {
  switch (ev.type) {
    case "head":
    case "drop":
    case "snapshot":
      return true;
    default:
      return ev.drop === drop;
  }
}

export const sseFrame = (ev: StreamEvent) => `data: ${JSON.stringify(ev)}\n\n`;

const g = globalThis as unknown as { __dibsSse?: { clients: number } };
export const sseClients = (g.__dibsSse ??= { clients: 0 });
