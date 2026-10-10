import { NextResponse } from "next/server";
import { createDrop, presenterOk, type DropParams } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Seller page: create a drop with the form's values. */
export async function POST(req: Request) {
  if (!presenterOk(req)) return NextResponse.json({ error: "presenter key required" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as DropParams;
  try {
    return NextResponse.json(await createDrop(body));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.slice(0, 200) }, { status: 502 });
  }
}
