"use client";
import { useEffect, useState } from "react";
import type { LocalAccount } from "viem";
import { LIMITS, orderMessage } from "@/lib/order";

/** After paying: the buyer tells the seller where to send the piece. Signed by the wallet that bought it. */
export function Delivery({ account, drop, piece, item }: { account: LocalAccount; drop: number; piece: number; item: string }) {
  const [state, setState] = useState<{ saved: boolean; shipped: boolean } | null>(null);
  const [form, setForm] = useState({ name: "", contact: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let stop = false;
    const check = () =>
      fetch(`/api/order?drop=${drop}&piece=${piece}`)
        .then((r) => r.json())
        .then((j) => !stop && setState(j))
        .catch(() => undefined);
    void check();
    const t = setInterval(check, 5_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [drop, piece]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const o = { drop, piece, name: form.name.trim(), contact: form.contact.trim(), address: form.address.trim(), ts: Date.now() };
      const sig = await account.signMessage!({ message: orderMessage(o) });
      const r = await fetch("/api/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...o, sig }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setError(j.error ?? "Couldn't send that.");
      else {
        setState((s) => ({ saved: true, shipped: s?.shipped ?? false }));
        setEditing(false);
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  if (state?.saved && !editing)
    return (
      <div className="mx-4 mt-3 rounded-lg bg-surface-1 px-3 py-3 text-[15px]">
        <b>{state.shipped ? "Shipped ✓" : "Delivery details sent to the seller ✓"}</b>
        <div className="text-sm text-ink-muted">
          {state.shipped ? `The seller marked your ${item} as shipped.` : `The seller can now see where to send your ${item}.`}{" "}
          {!state.shipped && (
            <button type="button" className="underline" onClick={() => setEditing(true)}>
              Change them
            </button>
          )}
        </div>
      </div>
    );

  const field = "h-11 w-full rounded-md border border-line-input bg-canvas px-3 text-[15px]";
  return (
    <form
      className="mx-4 mt-3 flex flex-col gap-2 rounded-lg bg-surface-1 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <b className="text-[15px]">Where should the seller send your {item}?</b>
      <span className="text-[13px] text-ink-muted">Only this seller sees it. Demo store: nothing really ships, so use made-up details.</span>
      <input className={field} placeholder="Name or Instagram handle" aria-label="Name or Instagram handle" maxLength={LIMITS.name} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <input className={field} placeholder="Phone or email (optional)" aria-label="Phone or email (optional)" maxLength={LIMITS.contact} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
      <textarea className={`${field} h-20 py-2`} placeholder="Delivery address" aria-label="Delivery address" maxLength={LIMITS.address} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
      {error && <span className="text-sm font-semibold text-danger">{error}</span>}
      <button type="submit" aria-disabled={busy || undefined} className="h-11 rounded-full bg-ink font-semibold text-canvas">
        {busy ? "Sending…" : "Send to the seller"}
      </button>
    </form>
  );
}
