// The only thing Dibs keeps off chain: delivery details and product listings. They are private or bulky, so they
// don't belong on a public chain. One JSON file under DATA_DIR (a Railway volume in production, /tmp locally).
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Order = {
  drop: number;
  piece: number;
  buyer: string;
  name: string;
  contact: string;
  address: string;
  at: number;
  shipped?: number;
};
export type Product = { id?: string; name: string; size: string; photo: string };
/** One piece of the seller's stock. One-of-a-kind: once sold it leaves the list of things that can be dropped. */
export type Stock = Product & { id: string; sold?: { drop: number; piece: number; at: number } };
type Data = { orders: Record<string, Order>; drops: Record<string, Product[]>; inventory?: Stock[] };

/** Pure: the stock after the seller submits a listing. Unsold pieces not in the listing are removed; sold ones stay as history. */
export function mergeListing(stock: Stock[], listing: Product[], newId: () => string): { stock: Stock[]; listed: Stock[] } {
  const sold = stock.filter((s) => s.sold);
  const listed: Stock[] = listing.map((p) => {
    const known = p.id ? stock.find((s) => s.id === p.id && !s.sold) : undefined;
    return { id: known ? known.id : newId(), name: p.name, size: p.size, photo: p.photo };
  });
  return { stock: [...listed, ...sold], listed };
}

/** Pure: mark the stock item behind (drop, piece) as sold. Returns the same array if nothing changed. */
export function soldStock(stock: Stock[], id: string | undefined, drop: number, piece: number, at: number): Stock[] {
  if (!id || !stock.some((s) => s.id === id && !s.sold)) return stock;
  return stock.map((s) => (s.id === id && !s.sold ? { ...s, sold: { drop, piece, at } } : s));
}

export const DATA_DIR = process.env.DATA_DIR || "/tmp/dibs-data";
const FILE = join(DATA_DIR, "dibs.json");

class Store {
  data: Data = { orders: {}, drops: {} };
  pendingMeta = new Map<string, Product[]>(); // createDrop tx hash → the products the seller listed
  persistent = false;
  constructor() {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      if (existsSync(FILE)) this.data = { orders: {}, drops: {}, ...JSON.parse(readFileSync(FILE, "utf8")) };
      this.persistent = true;
    } catch (e) {
      console.error("store: running in memory only", (e as Error).message);
    }
  }
  save() {
    if (!this.persistent) return;
    try {
      writeFileSync(FILE + ".tmp", JSON.stringify(this.data));
      renameSync(FILE + ".tmp", FILE);
    } catch (e) {
      console.error("store: save failed", (e as Error).message);
    }
  }
  orderKey = (drop: number, piece: number) => `${drop}:${piece}`;
  putOrder(o: Order) {
    this.data.orders[this.orderKey(o.drop, o.piece)] = o;
    this.save();
  }
  getOrder(drop: number, piece: number): Order | undefined {
    return this.data.orders[this.orderKey(drop, piece)];
  }
  setProducts(drop: number, products: Product[]) {
    this.data.drops[String(drop)] = products;
    this.save();
  }
  products(drop: number): Product[] | undefined {
    return this.data.drops[String(drop)];
  }
  /** The seller's stock, seeded with the demo store's default pieces the first time. */
  inventory(defaults: Product[]): Stock[] {
    if (!this.data.inventory) {
      this.data.inventory = defaults.map((p, i) => ({ id: String(i).padStart(8, "0"), name: p.name, size: p.size, photo: p.photo }));
      this.save();
    }
    return this.data.inventory;
  }
  /** Save a listing as the current stock and return it with ids. */
  saveListing(listing: Product[], defaults: Product[]): Stock[] {
    const { stock, listed } = mergeListing(this.inventory(defaults), listing, () => randomBytes(4).toString("hex"));
    this.data.inventory = stock;
    this.save();
    return listed;
  }
  /** Demo store only: put back any default piece that isn't currently in stock (sold history is kept). */
  restock(defaults: Product[]): Stock[] {
    const stock = this.inventory(defaults);
    const have = new Set(stock.filter((s) => !s.sold).map((s) => s.name));
    const back = defaults.filter((p) => !have.has(p.name)).map((p) => ({ id: randomBytes(4).toString("hex"), name: p.name, size: p.size, photo: p.photo }));
    this.data.inventory = [...back, ...stock];
    this.save();
    return this.data.inventory;
  }
  /** A piece was paid for: take it out of stock. */
  markSold(drop: number, piece: number) {
    const id = this.products(drop)?.[piece]?.id;
    if (!this.data.inventory) return;
    const next = soldStock(this.data.inventory, id, drop, piece, Date.now());
    if (next !== this.data.inventory) {
      this.data.inventory = next;
      this.save();
    }
  }
  /** Product photos are plain files next to the JSON. Returns false when the disk can't be written. */
  savePhoto(id: string, bytes: Buffer): boolean {
    try {
      mkdirSync(join(DATA_DIR, "photos"), { recursive: true });
      writeFileSync(join(DATA_DIR, "photos", id), bytes);
      return true;
    } catch {
      return false;
    }
  }
  readPhoto(id: string): Buffer | null {
    try {
      return readFileSync(join(DATA_DIR, "photos", id));
    } catch {
      return null;
    }
  }
}

const g = globalThis as unknown as { __dibsStore?: Store };
export const getStore = () => (g.__dibsStore ??= new Store());
