import { NextResponse } from "next/server";
import { wants } from "@/lib/hub";
import { getIndexer } from "@/lib/indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Polling fallback for /api/stream: events after `since`, or a fresh snapshot when `since` is 0 or too old. */
export async function GET(req: Request) {
  const ix = getIndexer();
  await ix.ready;
  const url = new URL(req.url);
  const drop = ix.resolveDrop(url.searchParams.get("drop"));
  const since = Number(url.searchParams.get("since") ?? 0);
  const oldest = ix.recent[0]?.seq ?? ix.seq + 1;
  const headers = { "cache-control": "no-store" };
  if (!since || since < oldest - 1) return NextResponse.json({ seq: ix.seq, snapshot: ix.snapshot(drop), events: [] }, { headers });
  const events = ix.recent.filter((r) => r.seq > since && wants(drop, r.ev)).map((r) => r.ev);
  return NextResponse.json({ seq: ix.seq, events }, { headers });
}
