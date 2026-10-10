// The only thing Dibs keeps off chain: delivery details and product listings. They are private or bulky, so they
// don't belong on a public chain. One JSON file under DATA_DIR (a Railway volume in production, /tmp locally).
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
export type Product = { name: string; size: string; photo: string };
type Data = { orders: Record<string, Order>; drops: Record<string, Product[]> };

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
