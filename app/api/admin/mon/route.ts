import { NextResponse } from "next/server";
import { formatEther, isAddress, parseEther, type Hex } from "viem";
import { presenterOk } from "@/lib/admin";
import { maxFeeFor, publicClient } from "@/lib/chain";
import { errText, getOperator, RESERVE, spendable } from "@/lib/operator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Wallets we control that the operator may move MON to (comma-separated in MON_PEERS). */
const peers = () =>
  (process.env.MON_PEERS ?? "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);

/**
 * Move test MON from the operator to another wallet we control, through the operator's own nonce queue
 * (so a live server never trips over a transaction sent from outside).
 * POST {to, amount, belowReserve?}. The 10 MON reserve is parked, not spent: by default the operator keeps it.
 * belowReserve: true sends anyway; Monad only lets that through when this wallet has been idle for a few blocks,
 * and afterwards Dibs cannot fund phones until MON comes back.
 */
export async function POST(req: Request) {
  if (!presenterOk(req)) return NextResponse.json({ error: "presenter key required" }, { status: 401 });
  const op = getOperator();
  if (!op) return NextResponse.json({ error: "operator not configured" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { to?: string; amount?: string | number; belowReserve?: boolean };
  if (!body.to || !isAddress(body.to)) return NextResponse.json({ error: "to: address required" }, { status: 400 });
  if (!peers().includes(body.to.toLowerCase()))
    return NextResponse.json({ error: "to is not in MON_PEERS (wallets we control)" }, { status: 403 });
  let value: bigint;
  try {
    value = parseEther(String(body.amount));
  } catch {
    return NextResponse.json({ error: "amount: MON as a number" }, { status: 400 });
  }
  if (value <= 0n) return NextResponse.json({ error: "amount must be positive" }, { status: 400 });
  const bal = await op.balance();
  const fee = 21_000n * maxFeeFor(op.baseFee);
  if (bal < value + fee) return NextResponse.json({ error: `operator holds ${formatEther(bal)} MON` }, { status: 409 });
  if (!body.belowReserve && value > spendable(bal))
    return NextResponse.json(
      { error: `only ${formatEther(spendable(bal))} MON is spendable above the 10 MON reserve; pass belowReserve: true to park the reserve elsewhere` },
      { status: 409 },
    );
  try {
    const hash = await op.sendTx({ to: body.to as Hex, data: "0x", value, gas: 21_000n });
    const r = await publicClient().waitForTransactionReceipt({ hash, pollingInterval: 250, timeout: 30_000 });
    const after = await op.balance();
    return NextResponse.json({
      tx: hash,
      status: r.status,
      operatorMon: formatEther(after),
      belowReserve: after < RESERVE,
      note: r.status === "success" ? undefined : "reverted: Monad's reserve rule refuses a transfer that leaves a busy wallet under 10 MON; retry when the wallet has been idle for a few blocks",
    });
  } catch (e) {
    return NextResponse.json({ error: errText(e).slice(0, 200) }, { status: 502 });
  }
}
