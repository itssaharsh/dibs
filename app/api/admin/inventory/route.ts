import { NextResponse } from "next/server";
import { DEFAULT_PRODUCTS, presenterOk } from "@/lib/admin";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → the seller's stock: what can still be dropped, and what has sold (with the drop it sold in). */
export async function GET(req: Request) {
  if (!presenterOk(req)) return NextResponse.json({ error: "presenter key required" }, { status: 401 });
  const stock = getStore().inventory(DEFAULT_PRODUCTS);
  return NextResponse.json(
    {
      available: stock.filter((s) => !s.sold).map(({ id, name, size, photo }) => ({ id, name, size, photo })),
      sold: stock.filter((s) => s.sold).map((s) => ({ id: s.id, name: s.name, size: s.size, photo: s.photo, drop: s.sold!.drop, piece: s.sold!.piece, at: s.sold!.at })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
