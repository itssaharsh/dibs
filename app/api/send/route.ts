import { NextResponse } from "next/server";
import { recoverTransactionAddress, type Hex } from "viem";
import { addresses } from "@/lib/chain";
import { checkRawTx, MAX_BODY, RateLimiter } from "@/lib/guards";
import { getIndexer } from "@/lib/indexer";
import { errText, getOperator, Relay } from "@/lib/operator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const g = globalThis as unknown as { __dibsLimiter?: RateLimiter; __dibsRelay?: Relay };

/** POST {raw} → forwards a buyer's signed tx (never re-signs). The place in line arrives on the stream. */
export async function POST(req: Request) {
  const received = Date.now();
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) return NextResponse.json({ error: "body too large" }, { status: 413 });
  const text = await req.text();
  if (text.length > MAX_BODY) return NextResponse.json({ error: "body too large" }, { status: 413 });
  let raw: unknown;
  try {
    raw = (JSON.parse(text) as { raw?: unknown }).raw;
  } catch {
    return NextResponse.json({ error: "json body {raw} required" }, { status: 400 });
  }
  const check = checkRawTx(raw, [addresses.dropHouse, addresses.token]);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });
  const from = await recoverTransactionAddress({ serializedTransaction: raw as Hex & `0x02${string}` });
  g.__dibsLimiter ??= new RateLimiter();
  if (!g.__dibsLimiter.allow(from)) return NextResponse.json({ error: "slow down: 5 transactions per 10 s" }, { status: 429 });
  const relay = (g.__dibsRelay ??= getOperator()?.relay ?? new Relay());
  try {
    const hash = await relay.send(raw as Hex);
    const ix = getIndexer();
    ix.sendTimes.set(hash.toLowerCase(), received);
    return NextResponse.json({ hash });
  } catch (e) {
    return NextResponse.json({ error: errText(e).slice(0, 200) }, { status: 502 });
  }
}
