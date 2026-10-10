import { NextResponse } from "next/server";
import { formatEther } from "viem";
import { getIndexer } from "@/lib/indexer";
import { sseClients } from "@/lib/hub";
import { affordable, getOperator, PHONE_GAS, spendable } from "@/lib/operator";
import { maxFeeFor } from "@/lib/chain";

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
  // "low" = can't fund even one more phone without dipping under Monad's 10 MON reserve
  const phones = op && bal !== null ? affordable(bal, PHONE_GAS, maxFeeFor(op.baseFee), 400) : 0;
  const ok = !!op && bal !== null && lag !== null && lag < 60;
  return NextResponse.json(
    {
      ok,
      operator: op ? { address: op.address, mon: bal === null ? null : formatEther(bal), low: phones === 0, spendable: bal === null ? null : formatEther(spendable(bal)), phonesAffordable: phones, sent: op.sent } : null,
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
