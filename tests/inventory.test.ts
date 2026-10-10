import { describe, expect, it } from "vitest";
import { mergeListing, soldStock, type Stock } from "@/lib/store";

const stock: Stock[] = [
  { id: "00000000", name: "Denim jacket", size: "M", photo: "/pieces/denim-jacket.svg" },
  { id: "00000001", name: "Block-print kurta", size: "S", photo: "/pieces/kurta.svg" },
];
let n = 0;
const newId = () => `aaaa000${n++}`;

describe("the seller's stock", () => {
  it("a paid piece leaves the list of things that can be dropped", () => {
    const after = soldStock(stock, "00000000", 7, 0, 123);
    expect(after.filter((s) => !s.sold).map((s) => s.name)).toEqual(["Block-print kurta"]);
    expect(after.find((s) => s.id === "00000000")?.sold).toEqual({ drop: 7, piece: 0, at: 123 });
    // unknown id, or already sold: nothing changes
    expect(soldStock(stock, undefined, 7, 0, 1)).toBe(stock);
    expect(soldStock(after, "00000000", 9, 0, 2)).toBe(after);
  });

  it("a listing keeps ids for known pieces, gives new pieces an id, and keeps sold history", () => {
    const sold = soldStock(stock, "00000000", 7, 0, 123);
    const { stock: next, listed } = mergeListing(sold, [{ id: "00000001", name: "Kurta, block print", size: "S", photo: "/pieces/kurta.svg" }, { name: "Linen shirt", size: "L", photo: "/api/photo/0123456789abcdef.jpg" }], newId);
    expect(listed.map((p) => p.id)).toEqual(["00000001", "aaaa0000"]);
    expect(listed[0].name).toBe("Kurta, block print");
    expect(next.filter((s) => s.sold).map((s) => s.name)).toEqual(["Denim jacket"]);
  });

  it("a sold piece cannot be re-listed under its old id", () => {
    const sold = soldStock(stock, "00000000", 7, 0, 123);
    const { listed } = mergeListing(sold, [{ id: "00000000", name: "Denim jacket", size: "M", photo: "/pieces/denim-jacket.svg" }], newId);
    expect(listed[0].id).not.toBe("00000000"); // it is treated as a new piece, not the one that sold
  });

  it("a piece the seller removed from the listing is gone from stock", () => {
    const { stock: next } = mergeListing(stock, [{ id: "00000001", name: "Block-print kurta", size: "S", photo: "/pieces/kurta.svg" }], newId);
    expect(next.map((s) => s.name)).toEqual(["Block-print kurta"]);
  });
});
