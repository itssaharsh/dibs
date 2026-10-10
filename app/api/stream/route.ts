import { getIndexer } from "@/lib/indexer";
import { sseClients, sseFrame, wants } from "@/lib/hub";
import type { StreamEvent } from "@/lib/stream-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ix = getIndexer();
  await ix.ready;
  const url = new URL(req.url);
  const drop = ix.resolveDrop(url.searchParams.get("drop"));
  const enc = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => {
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          cleanup();
        }
      };
      send("retry: 2000\n\n");
      send(sseFrame({ type: "snapshot", data: ix.snapshot(drop) }));
      const off = ix.subscribe((ev: StreamEvent) => {
        if (wants(drop, ev)) send(sseFrame(ev));
      });
      const ka = setInterval(() => send(": keep-alive\n\n"), 15_000);
      sseClients.clients++;
      let done = false;
      cleanup = () => {
        if (done) return;
        done = true;
        off();
        clearInterval(ka);
        sseClients.clients--;
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
