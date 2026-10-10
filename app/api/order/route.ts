import { NextResponse } from "next/server";
import { recoverMessageAddress, type Hex } from "viem";
import { getIndexer } from "@/lib/indexer";
import { checkOrder, orderMessage, type OrderInput } from "@/lib/order";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST: the buyer of a sold piece sends delivery details, signed by the wallet that paid. */
export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > 2_000) return NextResponse.json({ error: "body too large" }, { status: 413 });
  let body: Partial<OrderInput> & { sig?: string };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "json required" }, { status: 400 });
  }
  const bad = checkOrder(body);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const o = body as OrderInput;
  const ix = getIndexer();
  await ix.ready;
  const piece = ix.drops.get(o.drop)?.pieces[o.piece];
  if (!piece?.sold || !piece.buyer) return NextResponse.json({ error: "This piece isn't sold" }, { status: 409 });
  let signer: string;
  try {
    signer = await recoverMessageAddress({ message: orderMessage(o), signature: body.sig as Hex });
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }
  if (signer.toLowerCase() !== piece.buyer.toLowerCase())
    return NextResponse.json({ error: "Only the buyer of this piece can set its delivery details" }, { status: 403 });
  const store = getStore();
  const prev = store.getOrder(o.drop, o.piece);
  store.putOrder({ drop: o.drop, piece: o.piece, buyer: piece.buyer, name: o.name.trim(), contact: (o.contact ?? "").trim(), address: o.address.trim(), at: Date.now(), shipped: prev?.shipped });
  return NextResponse.json({ ok: true });
}

/** GET ?drop=&piece= → whether details were received and whether it has shipped. No personal details. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const o = getStore().getOrder(Number(u.searchParams.get("drop")), Number(u.searchParams.get("piece")));
  return NextResponse.json({ saved: !!o, shipped: !!o?.shipped }, { headers: { "cache-control": "no-store" } });
}
