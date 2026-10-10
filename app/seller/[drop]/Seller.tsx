"use client";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { presenterKeyFromHash, useClientValue } from "@/lib/useClient";
import { PresenterKey } from "@/components/PresenterKey";
import { Wordmark } from "@/components/Wordmark";
import seed from "@/seed/drop.json";
import { txUrl } from "@/lib/chain";
import { nick } from "@/lib/nick";
import { holderOf, type StreamEvent } from "@/lib/stream-types";
import { fmtClock, fmtNum, useChainClock, useDropStream, useNow } from "@/lib/useDropStream";

type SellerOrder = {
  drop: number; piece: number; item: string; size: string; nick: string; paid: string; shipped: boolean;
  details: { name: string; contact: string; address: string } | null;
};
type Product = { name: string; size: string; photo: string };
const MAX_PRODUCTS = 6;

/** Shrink a phone photo in the browser (longest side 900 px, JPEG) so the upload stays small. */
async function shrink(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 900 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * k);
  canvas.height = Math.round(img.height * k);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

type Entry = { kind: "Paid" | "Ghosted" | "Returned"; piece: string; who: string; amount: string; tx: string | null; at: number };

export function Seller({ drop }: { drop: string }) {
  const router = useRouter();
  const key = useClientValue(presenterKeyFromHash, null);
  const origin = useClientValue(() => window.location.origin, "");
  const [ledger, setLedger] = useState<Entry[]>([]);
  const [form, setForm] = useState({ price: 450, deposit: 50, payWindow: 60, startsIn: 30 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [products, setProducts] = useState<Product[]>(() => seed.pieces.map((p) => ({ name: p.name, size: p.size, photo: p.photo })));
  const [uploading, setUploading] = useState<number | null>(null);
  const now = useNow(500);

  const onEvent = useCallback((ev: StreamEvent) => {
    if (ev.type === "paid" || ev.type === "forfeited" || ev.type === "refunded") {
      setLedger((l) =>
        [{ kind: ev.type === "paid" ? "Paid" : ev.type === "forfeited" ? "Ghosted" : "Returned", piece: `#${ev.piece + 1}`, who: nick(ev.addr), amount: ev.amount, tx: ev.tx, at: Date.now() } as Entry, ...l].slice(0, 40),
      );
    }
  }, []);
  const { snap, connected } = useDropStream(drop, onEvent);
  const chainSec = useChainClock(snap, now);
  const d = snap?.drop;
  const link = `${origin}/d/${d?.id ?? drop}`;

  // the seller's order list: sold pieces and where to send them (seller only)
  const dropId = d?.id;
  useEffect(() => {
    if (!key || !dropId) return;
    let stop = false;
    const load = () =>
      fetch(`/api/admin/orders?drop=${dropId}`, { headers: { "x-presenter-key": key } })
        .then((r) => (r.ok ? r.json() : { orders: [] }))
        .then((j) => !stop && setOrders(j.orders ?? []))
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 4_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [key, dropId]);

  const shown = orders.filter((o) => o.drop === dropId); // never the previous drop's orders

  const ship = async (o: SellerOrder) => {
    if (!key) return;
    await fetch("/api/admin/orders", {
      method: "POST",
      headers: { "x-presenter-key": key, "content-type": "application/json" },
      body: JSON.stringify({ drop: o.drop, piece: o.piece, shipped: !o.shipped }),
    }).catch(() => undefined);
    setOrders((list) => list.map((x) => (x.piece === o.piece ? { ...x, shipped: !o.shipped } : x)));
  };

  const setProduct = (i: number, patch: Partial<Product>) => setProducts((list) => list.map((p, k) => (k === i ? { ...p, ...patch } : p)));

  const addPhoto = async (i: number, file: File | undefined) => {
    if (!file || !key) return;
    setUploading(i);
    setMsg(null);
    try {
      const dataUrl = await shrink(file);
      const r = await fetch("/api/admin/photo", { method: "POST", headers: { "x-presenter-key": key, "content-type": "application/json" }, body: JSON.stringify({ dataUrl }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg(j.error ?? "Couldn't upload that photo.");
      else setProduct(i, { photo: j.url });
    } catch {
      setMsg("Couldn't read that photo.");
    } finally {
      setUploading(null);
    }
  };

  const create = async () => {
    if (!key) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/create", {
        method: "POST",
        headers: { "x-presenter-key": key, "content-type": "application/json" },
        body: JSON.stringify({ ...form, products }),
      });
      const j = await r.json();
      if (r.status === 401) setMsg("That presenter key isn't right.");
      else if (!r.ok) setMsg(j.error ?? "Couldn't create the drop.");
      else router.push(`/seller/${j.id}${window.location.hash}`);
    } catch {
      setMsg("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, k: keyof typeof form, unit: string) => (
    <label className="flex items-center justify-between gap-3 text-[15px]">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          value={form[k]}
          onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })}
          className="tabular h-11 w-24 rounded-md border border-line-input bg-canvas px-2 text-right"
        />
        <span className="w-10 text-ink-muted">{unit}</span>
      </span>
    </label>
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-[520px] flex-col gap-5 px-4 pb-10">
      <header className="flex h-[52px] items-center gap-2">
        <Link href="/" aria-label="Dibs home">
          <Wordmark size={22} />
        </Link>
        <span className="flex-1" />
        <span className="text-sm text-ink-muted">Seller · pocket.thrift (demo store)</span>
      </header>

      <section className="flex flex-col gap-3 rounded-[14px] bg-surface-1 p-4">
        <h1 className="display m-0 text-xl">New drop</h1>
        <p className="m-0 text-sm text-ink-muted">List what you&apos;re selling. Buyers put down a deposit to call dibs; a ghost&apos;s deposit is yours.</p>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {products.map((p, i) => (
            <li key={i} className="flex items-center gap-2">
              <label className="relative h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-lg bg-canvas" title="Change photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.photo} alt="" className="h-full w-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 bg-ink/70 text-center text-[10px] font-semibold text-canvas">{uploading === i ? "…" : "photo"}</span>
                <input type="file" accept="image/*" className="sr-only" aria-label={`Photo for product ${i + 1}`} disabled={!key} onChange={(e) => void addPhoto(i, e.target.files?.[0])} />
              </label>
              <input value={p.name} onChange={(e) => setProduct(i, { name: e.target.value })} maxLength={40} placeholder="Name" aria-label={`Name of product ${i + 1}`} className="h-11 min-w-0 flex-1 rounded-md border border-line-input bg-canvas px-2 text-[15px]" />
              <input value={p.size} onChange={(e) => setProduct(i, { size: e.target.value })} maxLength={20} placeholder="Size" aria-label={`Size of product ${i + 1}`} className="h-11 w-20 rounded-md border border-line-input bg-canvas px-2 text-[15px]" />
              <button type="button" aria-label={`Remove product ${i + 1}`} aria-disabled={products.length === 1 || undefined} onClick={() => products.length > 1 && setProducts((l) => l.filter((_, k) => k !== i))} className="h-11 w-9 shrink-0 rounded-md bg-canvas text-lg">
                ×
              </button>
            </li>
          ))}
        </ul>
        {products.length < MAX_PRODUCTS && (
          <button type="button" onClick={() => setProducts((l) => [...l, { name: "", size: "", photo: "/pieces/cap.svg" }])} className="h-10 rounded-lg bg-canvas text-[15px] font-semibold">
            + Add a product
          </button>
        )}
        {field("Price", "price", "tINR")}
        {field("Deposit", "deposit", "tINR")}
        {field("Pay window", "payWindow", "s")}
        {field("Opens in", "startsIn", "s")}
        {key ? (
          <button type="button" onClick={create} aria-disabled={busy || undefined} className="h-12 rounded-full bg-ink font-semibold text-canvas">
            {busy ? "Creating on Monad…" : "Create drop"}
          </button>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg bg-canvas p-3">
            <p className="m-0 text-sm text-ink-muted">
              Creating a drop spends this demo&apos;s test MON, so it is limited to the presenter. Enter the presenter key to create one, or
              watch the live drop below: that works for everyone.
            </p>
            <PresenterKey label="Unlock create" />
          </div>
        )}
        {msg && <p className="m-0 text-sm font-semibold text-danger">{msg}</p>}
      </section>

      {d && (
        <section className={`flex flex-col gap-3 ${!connected ? "stale" : ""}`}>
          <div className="flex items-baseline justify-between">
            <h2 className="display m-0 text-lg">Drop #{d.id}{d.synthetic ? " · bot round (synthetic)" : ""}</h2>
            <span className="text-sm text-ink-muted">{d.startsAt > chainSec ? `opens in ${fmtClock(d.startsAt - chainSec)}` : "live"}</span>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => navigator.clipboard?.writeText(link)} className="h-10 flex-1 rounded-lg bg-surface-1 font-semibold">
              Copy story link
            </button>
            <button type="button" onClick={() => setShowQr((s) => !s)} className="h-10 flex-1 rounded-lg bg-surface-1 font-semibold">
              {showQr ? "Hide QR" : "Show QR"}
            </button>
          </div>
          {showQr && origin && (
            <div className="self-center rounded-lg border-2 border-ink p-2">
              <QRCodeSVG value={link} size={200} />
            </div>
          )}
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {snap!.pieces.map((p) => {
              const h = holderOf(p);
              const b = p.sold ? p.queue.find((r) => r.status === "won") : null;
              return (
                <li key={p.index} className="perf flex items-center gap-3 pt-2 text-[15px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.photo} alt="" className="h-12 w-12 rounded-lg bg-surface-1 object-cover" />
                  <span className="flex-1">
                    <b>{p.name}</b>
                    <br />
                    <span className="text-ink-muted">
                      {b ? `Sold to #${b.position + 1} ${b.nick}` : h ? `#${h.position + 1} ${h.nick} has first dibs · ${fmtClock(p.deadline - chainSec)}` : "no one has first dibs"}
                    </span>
                  </span>
                  <span className="tabular text-ink-muted">{p.queue.length} called dibs</span>
                </li>
              );
            })}
          </ul>
          <div className="flex items-baseline gap-3 rounded-[14px] bg-surface-1 p-4">
            <span className="label-caps text-sm">Balance</span>
            <span className="display tabular text-2xl">{fmtNum(Math.round(Number(snap!.seller.balance)))} tINR</span>
          </div>
          <h3 className="m-0 text-sm font-semibold text-ink-muted">Orders to ship</h3>
          {!key ? (
            <p className="m-0 text-sm text-ink-muted">Only the seller sees buyers&apos; delivery details. Enter the presenter key above.</p>
          ) : shown.length === 0 ? (
            <p className="m-0 text-sm text-ink-muted">Nothing sold in this drop yet. When a buyer pays, their order appears here.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {shown.map((o) => (
                <li key={o.piece} className="flex flex-col gap-1 rounded-lg bg-surface-1 p-3 text-[15px]">
                  <span>
                    <b>{o.item}</b> · {o.size} · paid {fmtNum(o.paid)} tINR by {o.nick}
                  </span>
                  {o.details ? (
                    <>
                      <span>
                        Send to: <b>{o.details.name}</b>
                        {o.details.contact ? ` · ${o.details.contact}` : ""}
                      </span>
                      <span className="whitespace-pre-wrap text-ink-muted">{o.details.address}</span>
                      <button type="button" onClick={() => ship(o)} className={`mt-1 h-10 rounded-full font-semibold ${o.shipped ? "bg-success text-canvas" : "bg-ink text-canvas"}`}>
                        {o.shipped ? "Shipped ✓ (tap to undo)" : "Mark shipped"}
                      </button>
                    </>
                  ) : (
                    <span className="text-ink-muted">Waiting for the buyer&apos;s delivery details.</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <h3 className="m-0 text-sm font-semibold text-ink-muted">Ledger (this session)</h3>
          {ledger.length === 0 ? (
            <p className="m-0 text-sm text-ink-muted">Payments, ghosts&apos; deposits and deposits returned to buyers appear here as they land.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0 text-sm">
              {ledger.map((e) => (
                <li key={`${e.at}-${e.tx}`} className="perf flex justify-between py-1.5">
                  <span>
                    {e.kind === "Paid" ? "Paid by" : e.kind === "Ghosted" ? "Ghosted by" : "Deposit returned to"} {e.who} · piece {e.piece}
                  </span>
                  <span className="tabular">
                    {e.kind === "Returned" ? <span className="text-ink-muted">{fmtNum(e.amount)} from the contract, not from you</span> : `+${fmtNum(e.amount)}`}{" "}
                    {e.tx && <a href={txUrl(e.tx)} target="_blank" rel="noreferrer">↗</a>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <p className="text-xs text-ink-muted">Test money (tINR) on Monad testnet. Nothing real is sold.</p>
    </div>
  );
}
