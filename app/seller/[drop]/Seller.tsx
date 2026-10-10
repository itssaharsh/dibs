"use client";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { presenterKeyFromHash, useClientValue } from "@/lib/useClient";
import { PresenterKey } from "@/components/PresenterKey";
import { Wordmark } from "@/components/Wordmark";
import { txUrl } from "@/lib/chain";
import { nick } from "@/lib/nick";
import { holderOf, type StreamEvent } from "@/lib/stream-types";
import { fmtClock, fmtNum, useChainClock, useDropStream, useNow } from "@/lib/useDropStream";

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

  const create = async () => {
    if (!key) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/create", {
        method: "POST",
        headers: { "x-presenter-key": key, "content-type": "application/json" },
        body: JSON.stringify({ ...form, pieces: 3 }),
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
        <p className="m-0 text-sm text-ink-muted">Three pieces from the demo store. Buyers pay a deposit to get in line; a no-show&apos;s deposit is yours.</p>
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
