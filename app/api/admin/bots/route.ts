import { NextResponse } from "next/server";
import { presenterOk } from "@/lib/admin";
import { botState, runBotRound } from "@/lib/bots";
import { getIndexer } from "@/lib/indexer";
import { getOperator } from "@/lib/operator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Run bot round (synthetic): returns at once; progress arrives on the stream as `bots` events. */
export async function POST(req: Request) {
  if (!presenterOk(req)) return NextResponse.json({ error: "presenter key required" }, { status: 401 });
  const op = getOperator();
  if (!op) return NextResponse.json({ error: "operator not configured" }, { status: 503 });
  if (botState().running) return NextResponse.json({ running: true, drop: botState().drop }, { status: 409 });
  const ix = getIndexer();
  runBotRound(ix, op).catch((e) => console.error("bot round", e));
  return NextResponse.json({ started: true }, { status: 202 });
}
