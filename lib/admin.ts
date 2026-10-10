import { timingSafeEqual } from "node:crypto";
import { parseEther, parseEventLogs } from "viem";
import { addresses, GAS, publicClient } from "@/lib/chain";
import { dropHouseAbi, getOperator } from "@/lib/operator";

/** Admin routes need header x-presenter-key = PRESENTER_KEY. */
export function presenterOk(req: Request, key = process.env.PRESENTER_KEY): boolean {
  const got = req.headers.get("x-presenter-key") ?? "";
  if (!key || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type DropParams = { startsIn?: number; payWindow?: number; price?: number; deposit?: number; pieces?: number };

/** Operator creates a drop (the operator is the demo seller) and returns its id once included. */
export async function createDrop(p: DropParams = {}): Promise<{ id: number; tx: string; startsAt: number }> {
  const op = getOperator();
  if (!op) throw new Error("operator not configured");
  const startsAt = Math.floor(Date.now() / 1000) + Math.max(0, Math.min(p.startsIn ?? 5, 3600));
  const payWindow = Math.max(2, Math.min(p.payWindow ?? 30, 3600));
  const price = Math.max(1, Math.min(p.price ?? 450, 100_000));
  const deposit = Math.max(1, Math.min(p.deposit ?? 50, price));
  const pieces = Math.max(1, Math.min(p.pieces ?? 3, 3));
  const hash = await op.call(
    "createDrop",
    [addresses.token, BigInt(startsAt), payWindow, parseEther(String(price)), parseEther(String(deposit)), pieces],
    GAS.createDrop,
  );
  const r = await publicClient().waitForTransactionReceipt({ hash, pollingInterval: 250, timeout: 30_000 });
  if (r.status !== "success") throw new Error(`createDrop reverted ${hash}`);
  const ev = parseEventLogs({ abi: dropHouseAbi, logs: r.logs, eventName: "DropCreated" })[0] as unknown as { args: { dropId: bigint } };
  return { id: Number(ev.args.dropId), tx: hash, startsAt };
}
