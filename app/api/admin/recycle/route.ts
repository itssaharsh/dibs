import { NextResponse } from "next/server";
import { formatEther } from "viem";
import { presenterOk } from "@/lib/admin";
import { sweepBots } from "@/lib/bots";
import { getIndexer } from "@/lib/indexer";
import { getOperator } from "@/lib/operator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recycle: every bot wallet sends its leftover gas MON back to the operator. */
export async function POST(req: Request) {
  if (!presenterOk(req)) return NextResponse.json({ error: "presenter key required" }, { status: 401 });
  const op = getOperator();
  if (!op) return NextResponse.json({ error: "operator not configured" }, { status: 503 });
  try {
    const before = await op.balance();
    const res = await sweepBots(op, BigInt(getIndexer().head.baseFee));
    await new Promise((r) => setTimeout(r, 2_500)); // let the transfers land
    const after = await op.balance();
    return NextResponse.json({ ...res, operatorBefore: formatEther(before), operatorAfter: formatEther(after) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.slice(0, 200) }, { status: 409 });
  }
}
