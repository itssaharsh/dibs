import { timingSafeEqual } from "node:crypto";
import { parseEther, parseEventLogs } from "viem";
import { addresses, GAS, publicClient } from "@/lib/chain";
import { dropHouseAbi, getOperator } from "@/lib/operator";
import { getStore, type Product } from "@/lib/store";

/** Admin routes need header x-presenter-key = PRESENTER_KEY. */
export function presenterOk(req: Request, key = process.env.PRESENTER_KEY): boolean {
  const got = req.headers.get("x-presenter-key") ?? "";
  if (!key || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type DropParams = { startsIn?: number; payWindow?: number; price?: number; deposit?: number; pieces?: number; products?: Product[] };
export const MAX_PIECES = 6;

/** A seller's product list: 1 to 6 pieces, each with a name, a size and a photo we host. Returns null if unusable. */
export function cleanProducts(input: unknown): Product[] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_PIECES) return null;
  const out: Product[] = [];
  for (const x of input as Partial<Product>[]) {
    const name = String(x?.name ?? "").trim().slice(0, 40);
    const size = String(x?.size ?? "").trim().slice(0, 20);
    const photo = String(x?.photo ?? "");
    if (!name || !/^\/(api\/photo\/[a-f0-9]{16}\.(jpg|png|webp)|pieces\/[a-z0-9-]+\.(svg|jpg|png|webp))$/.test(photo)) return null;
    out.push({ name, size: size || "One size", photo });
  }
  return out;
}

/** Operator creates a drop (the operator is the demo seller) and returns its id once included. */
export async function createDrop(p: DropParams = {}): Promise<{ id: number; tx: string; startsAt: number }> {
  const op = getOperator();
  if (!op) throw new Error("operator not configured");
  const startsAt = Math.floor(Date.now() / 1000) + Math.max(0, Math.min(p.startsIn ?? 5, 3600));
  const payWindow = Math.max(2, Math.min(p.payWindow ?? 30, 3600));
  const price = Math.max(1, Math.min(p.price ?? 450, 100_000));
  const deposit = Math.max(1, Math.min(p.deposit ?? 50, price));
  const products = p.products ? cleanProducts(p.products) : null;
  if (p.products && !products) throw new Error("products: 1 to 6 pieces, each with a name and a photo");
  const pieces = products ? products.length : Math.max(1, Math.min(p.pieces ?? 3, MAX_PIECES));
  const hash = await op.call(
    "createDrop",
    [addresses.token, BigInt(startsAt), payWindow, parseEther(String(price)), parseEther(String(deposit)), pieces],
    GAS.createDrop,
  );
  // the indexer picks the listing up by this tx hash when the DropCreated event arrives
  if (products) getStore().pendingMeta.set(hash.toLowerCase(), products);
  const r = await publicClient().waitForTransactionReceipt({ hash, pollingInterval: 250, timeout: 30_000 });
  if (r.status !== "success") throw new Error(`createDrop reverted ${hash}`);
  const ev = parseEventLogs({ abi: dropHouseAbi, logs: r.logs, eventName: "DropCreated" })[0] as unknown as { args: { dropId: bigint } };
  const id = Number(ev.args.dropId);
  if (products) {
    getStore().setProducts(id, products);
    const { getIndexer } = await import("@/lib/indexer");
    getIndexer().setProducts(id, products); // in case the event arrived before the listing was stored
  }
  return { id, tx: hash, startsAt };
}
