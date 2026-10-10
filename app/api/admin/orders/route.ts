import { NextResponse } from "next/server";
import { presenterOk } from "@/lib/admin";
import { getIndexer } from "@/lib/indexer";
import { nick } from "@/lib/nick";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?drop= → the seller's order list for a drop: every sold piece, with delivery details once the buyer sent them. */
export async function GET(req: Request) {
  if (!presenterOk(req)) return NextResponse.json({ error: "presenter key required" }, { status: 401 });
  const ix = getIndexer();
  await ix.ready;
  const drop = ix.resolveDrop(new URL(req.url).searchParams.get("drop"));
  const e = ix.drops.get(drop);
  const store = getStore();
  const orders = (e?.pieces ?? [])
    .filter((p) => p.sold && p.buyer)
    .map((p) => {
      const o = store.getOrder(drop, p.index);
      return {
        drop,
        piece: p.index,
        item: p.name,
        size: p.size,
        buyer: p.buyer,
        nick: nick(p.buyer!),
        paid: e!.drop.price,
        details: o ? { name: o.name, contact: o.contact, address: o.address, at: o.at } : null,
        shipped: !!o?.shipped,
      };
    });
  return NextResponse.json({ drop, orders, kept: store.persistent ? "saved on the server" : "in memory only" }, { headers: { "cache-control": "no-store" } });
}

/** POST {drop, piece, shipped} → mark an order shipped (or not). */
export async function POST(req: Request) {
  if (!presenterOk(req)) return NextResponse.json({ error: "presenter key required" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { drop?: number; piece?: number; shipped?: boolean };
  const store = getStore();
  const o = store.getOrder(Number(b.drop), Number(b.piece));
  if (!o) return NextResponse.json({ error: "No delivery details for this piece yet" }, { status: 409 });
  store.putOrder({ ...o, shipped: b.shipped === false ? undefined : Date.now() });
  return NextResponse.json({ ok: true });
}
