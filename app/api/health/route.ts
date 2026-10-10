import { NextResponse } from "next/server";
import { formatEther } from "viem";
import { getIndexer } from "@/lib/indexer";
import { sseClients } from "@/lib/hub";
import { FUND_FLOOR, getOperator } from "@/lib/operator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ix = getIndexer();
  const op = getOperator();
  let bal: bigint | null = null;
  try {
    bal = op ? await op.balance() : null;
  } catch {}
  const lag = ix.head.block ? ix.head.block - Number(ix.lastScanned) : null;
  const ok = !!op && bal !== null && bal >= FUND_FLOOR && lag !== null && lag < 60;
  return NextResponse.json(
    {
      ok,
      operator: op ? { address: op.address, mon: bal === null ? null : formatEther(bal), low: bal !== null && bal < FUND_FLOOR, sent: op.sent } : null,
      indexer: {
        head: ix.head.block,
        lastScanned: Number(ix.lastScanned),
        lag,
        headAgeMs: ix.head.receivedAt ? Date.now() - ix.head.receivedAt : null,
        wsHeads: ix.wsHeads,
        latestDrop: ix.latestDrop,
        drops: [...ix.drops.keys()],
      },
      sseClients: sseClients.clients,
      rpcErrors: ix.rpcErrors + (op?.relay.errors ?? 0),
    },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
