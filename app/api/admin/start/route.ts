import { NextResponse } from "next/server";
import { createDrop, presenterOk } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Start drop: a fresh 3-piece drop that opens in 5 s (pay window 30 s unless given). */
export async function POST(req: Request) {
  if (!presenterOk(req)) return NextResponse.json({ error: "presenter key required" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { payWindow?: number };
  try {
    return NextResponse.json(await createDrop({ startsIn: 5, payWindow: body.payWindow ?? 30 }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.slice(0, 200) }, { status: 502 });
  }
}
