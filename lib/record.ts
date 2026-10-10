// Mirrors DropHouse.depositFor: a buyer's record (paid on time vs ghosted) prices their deposit at every drop.
export type BuyerRecord = { paid: number; ghosts: number };

export const standing = (r: BuyerRecord) => r.paid - r.ghosts;

/** Deposit in tINR for a buyer with this record on a drop whose base deposit and price are given. */
export function depositFor(base: number, price: number, r: BuyerRecord): number {
  const s = standing(r);
  const dep = s >= 2 ? base / 4 : s === 1 ? base / 2 : s === 0 ? base : base * (1 + Math.min(-s, 3));
  return Math.min(dep, price);
}

/** What a claim's deposit says about the buyer's record when they called dibs. */
export function recordLabel(deposit: number, base: number): string {
  const x = deposit / base;
  if (x <= 0.26) return "paid on time 2×+";
  if (x <= 0.51) return "paid on time 1×";
  if (x <= 1.01) return "new buyer";
  if (x <= 2.01) return "ghosted 1×";
  if (x <= 3.01) return "ghosted 2×";
  return "ghosted 3×+";
}

export const recordText = (r: BuyerRecord) =>
  r.paid === 0 && r.ghosts === 0 ? "no record yet" : `paid on time ${r.paid}× · ghosted ${r.ghosts}×`;
