import { NextResponse } from "next/server";
import { presenterOk } from "@/lib/admin";
import { formatEther } from "viem";
import { botState, MIN_BOTS, runBotRound, sizeRound } from "@/lib/bots";
import { getIndexer } from "@/lib/indexer";
import { getOperator, spendable } from "@/lib/operator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Run bot round (synthetic): returns at once; progress arrives on the stream as `bots` events. */
export async function POST(req: Request) {
  if (!presenterOk(req)) return NextResponse.json({ error: "presenter key required" }, { status: 401 });
  const op = getOperator();
  if (!op) return NextResponse.json({ error: "operator not configured" }, { status: 503 });
  if (botState().running) return NextResponse.json({ running: true, drop: botState().drop }, { status: 409 });
  const ix = getIndexer();
  const body = (await req.json().catch(() => ({}))) as { count?: number };
  const want = Math.max(2, Math.min(Number(body.count) || 100, 100));
  // size the round to what the operator can spend above Monad's 10 MON reserve
  const bal = await op.balance();
  const count = sizeRound(bal, BigInt(ix.head.baseFee), want);
  if (count < Math.min(want, MIN_BOTS))
    return NextResponse.json(
      { error: `Not enough test MON for a bot round: ${formatEther(spendable(bal))} spendable above the 10 MON reserve. Top up the operator.` },
      { status: 503 },
    );
  runBotRound(ix, op, count).catch((e) => console.error("bot round", e));
  return NextResponse.json({ started: true, count, asked: want }, { status: 202 });
}
