import { describe, expect, it } from "vitest";
import { cleanProducts } from "@/lib/admin";
import { applyStream, emptyStats, type Snapshot } from "@/lib/stream-types";

describe("a seller's own product list", () => {
  it("accepts 1 to 6 products with a name and a photo we host", () => {
    const ok = cleanProducts([{ name: " Linen shirt ", size: "L", photo: "/api/photo/0123456789abcdef.jpg" }, { name: "Cap", size: "", photo: "/pieces/cap.svg" }]);
    expect(ok).toEqual([{ name: "Linen shirt", size: "L", photo: "/api/photo/0123456789abcdef.jpg" }, { name: "Cap", size: "One size", photo: "/pieces/cap.svg" }]);
    expect(cleanProducts([])).toBeNull();
    expect(cleanProducts(Array(7).fill({ name: "x", size: "", photo: "/pieces/cap.svg" }))).toBeNull();
    expect(cleanProducts([{ name: "", size: "M", photo: "/pieces/cap.svg" }])).toBeNull();
  });

  it("refuses photos hosted anywhere else", () => {
    expect(cleanProducts([{ name: "x", size: "", photo: "https://evil.example/x.jpg" }])).toBeNull();
    expect(cleanProducts([{ name: "x", size: "", photo: "/api/photo/../../etc/passwd" }])).toBeNull();
    expect(cleanProducts([{ name: "x", size: "", photo: "javascript:alert(1)" }])).toBeNull();
  });

  it("reaches every screen as a meta event", () => {
    const piece = { index: 0, name: "Denim jacket", size: "M", photo: "/pieces/denim-jacket.svg", queue: [], head: 0, deadline: 0, sold: false, buyer: null };
    const s: Snapshot = { drop: { id: 9, seller: "0x1", token: "0x2", startsAt: 0, payWindow: 30, price: "450", deposit: "50", pieceCount: 1, synthetic: false }, latestDrop: 9, pieces: [piece], seller: { address: null, balance: "0" }, stats: emptyStats(), head: { block: 1, receivedAt: 0, baseFee: "0", ts: 0 } };
    const next = applyStream(s, { type: "meta", drop: 9, pieces: [{ index: 0, name: "Linen shirt", size: "L", photo: "/api/photo/0123456789abcdef.jpg" }] })!;
    expect(next.pieces[0]).toMatchObject({ name: "Linen shirt", size: "L", photo: "/api/photo/0123456789abcdef.jpg", queue: [] });
    expect(applyStream(s, { type: "meta", drop: 8, pieces: [{ index: 0, name: "Other", size: "", photo: "/pieces/cap.svg" }] })!.pieces[0].name).toBe("Denim jacket");
  });
});
