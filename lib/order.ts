// Delivery details: the buyer signs them with the wallet that bought the piece, so only the real buyer can set them.
export type OrderInput = { drop: number; piece: number; name: string; contact: string; address: string; ts: number };

export const LIMITS = { name: 80, contact: 80, address: 300 };

/** The exact text the buyer's wallet signs. */
export const orderMessage = (o: OrderInput) =>
  `Dibs delivery details\ndrop ${o.drop} piece ${o.piece}\nname: ${o.name}\ncontact: ${o.contact}\naddress: ${o.address}\nat: ${o.ts}`;

/** Returns an error message, or null when the details are acceptable. */
export function checkOrder(o: Partial<OrderInput>, now = Date.now()): string | null {
  if (!Number.isInteger(o.drop) || !Number.isInteger(o.piece) || o.drop! < 1 || o.piece! < 0) return "drop and piece required";
  const name = (o.name ?? "").trim();
  const address = (o.address ?? "").trim();
  if (!name) return "A name or handle is required";
  if (!address) return "A delivery address is required";
  if (name.length > LIMITS.name || (o.contact ?? "").length > LIMITS.contact || address.length > LIMITS.address) return "That's too long";
  if (typeof o.ts !== "number" || Math.abs(now - o.ts) > 10 * 60_000) return "The form expired; send it again";
  return null;
}
