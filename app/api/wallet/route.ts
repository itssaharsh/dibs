import { NextResponse } from "next/server";
import { formatEther, isAddress, parseEther, type Hex } from "viem";
import { addresses, publicClient } from "@/lib/chain";
import { FundOnce } from "@/lib/guards";
import { FUND_FLOOR, getOperator, MAX_FUNDED, PHONE_GAS, PHONE_TINR, tokenAbi } from "@/lib/operator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const g = globalThis as unknown as { __dibsFundOnce?: FundOnce<Hex | null>; __dibsTopups?: Map<string, number> };
const LOW_GAS = parseEther("0.07");

function fundOnce() {
  g.__dibsFundOnce ??= new FundOnce<Hex | null>(async (addr) => {
    const op = getOperator();
    if (!op) throw new Error("operator not configured");
    // already funded before a restart? a burner that holds tINR came from the Funder
    const tinr = (await publicClient().readContract({
      address: addresses.token, abi: tokenAbi, functionName: "balanceOf", args: [addr as Hex],
    })) as bigint;
    if (tinr >= PHONE_TINR / 10n) return null;
    if ((op.lastBalance || (await op.balance())) < FUND_FLOOR) throw Object.assign(new Error("operator low"), { status: 503 });
    const hash = await op.fund(addr as Hex);
    void op.balance();
    return hash;
  });
  return g.__dibsFundOnce;
}

/** POST {address} → funds a burner once (gas MON + tINR via Funder) and returns its nonces. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { address?: string } | null;
  const address = body?.address;
  if (!address || !isAddress(address)) return NextResponse.json({ error: "address required" }, { status: 400 });
  const f = fundOnce();
  if (!f.has(address) && f.size >= MAX_FUNDED) return NextResponse.json({ error: "funding cap reached" }, { status: 429 });
  const { promise, already } = f.run(address);
  try {
    const hash = await promise;
    const c = publicClient();
    // a phone reused across drops can run low on gas: top it up (gas only), at most once a minute
    let topup: Hex | null = null;
    const op = getOperator();
    const bal = await c.getBalance({ address: address as Hex });
    const last = g.__dibsTopups?.get(address.toLowerCase()) ?? 0;
    if (op && bal < LOW_GAS && Date.now() - last > 60_000 && (op.lastBalance || (await op.balance())) >= FUND_FLOOR) {
      (g.__dibsTopups ??= new Map()).set(address.toLowerCase(), Date.now());
      topup = await op.fund(address as Hex, PHONE_GAS, 0n);
    }
    const [nonce, permitNonce, mon, tinr] = await Promise.all([
      c.getTransactionCount({ address: address as Hex, blockTag: "pending" }),
      c.readContract({ address: addresses.token, abi: tokenAbi, functionName: "nonces", args: [address as Hex] }) as Promise<bigint>,
      c.getBalance({ address: address as Hex }),
      c.readContract({ address: addresses.token, abi: tokenAbi, functionName: "balanceOf", args: [address as Hex] }) as Promise<bigint>,
    ]);
    return NextResponse.json({
      funded: true,
      already: already || hash === null,
      topup,
      tx: hash,
      nonce,
      permitNonce: Number(permitNonce),
      mon: formatEther(mon),
      tinr: formatEther(tinr),
    });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 502;
    return NextResponse.json({ error: (e as Error).message?.slice(0, 160) ?? "funding failed" }, { status });
  }
}
