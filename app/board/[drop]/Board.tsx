"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HangTag, SoldMark } from "@/components/HangTag";
import { LedPanel } from "@/components/LedPanel";
import { LineRow } from "@/components/LineRow";
import { StatsStrip } from "@/components/StatsStrip";
import { Wordmark } from "@/components/Wordmark";
import { txUrl } from "@/lib/chain";
import { chime } from "@/lib/chime";
import { fixtureSnapshot } from "@/lib/fixtures";
import { holderOf, type ClaimRow, type Snapshot, type StreamEvent } from "@/lib/stream-types";
import { presenterKeyFromHash, useClientValue } from "@/lib/useClient";
import { fmtClock, fmtNum, useChainClock, useDropStream, useNow } from "@/lib/useDropStream";

const VISIBLE = 12;

export function Board({ drop, fixture }: { drop: string; fixture: string | null }) {
  const router = useRouter();
  const key = useClientValue(presenterKeyFromHash, null);
  const origin = useClientValue(() => window.location.origin, "");
  const [sound, setSound] = useState(false);
  const [paused, setPaused] = useState<Snapshot | null>(null);
  const [featured, setFeatured] = useState(0);
  const [torn, setTorn] = useState<Set<string>>(new Set());
  const [lastForfeit, setLastForfeit] = useState<{ nick: string; amount: string; tx: string | null; at: number } | null>(null);
  const [blink, setBlink] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [bots, setBots] = useState<string | null>(null);
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);
  const now = useNow(250);

  const snapRef = useRef<Snapshot | null>(null);
  const onEvent = useCallback(
    (ev: StreamEvent) => {
      if (ev.type === "head") setBlink((b) => b + 1);
      if (ev.type === "drop") {
        router.replace(`/board/${ev.id}${window.location.hash}`);
      }
      if (ev.type === "turn" && soundRef.current) chime();
      if (ev.type === "forfeited") {
        const row = snapRef.current?.pieces[ev.piece]?.queue.find((r) => r.addr.toLowerCase() === ev.addr.toLowerCase());
        const id = `${ev.piece}:${ev.addr}`;
        setTorn((t) => new Set(t).add(id));
        setTimeout(() => setTorn((t) => {
          const n = new Set(t);
          n.delete(id);
          return n;
        }), 700);
        setLastForfeit({ nick: row?.nick ?? "a no-show", amount: ev.amount, tx: ev.tx, at: Date.now() });
      }
      if (ev.type === "bots") {
        setBots(
          ev.phase === "funding"
            ? `Bot round running… funding ${ev.done}/${ev.total}`
            : ev.phase === "claiming"
              ? `Bot round running… ${ev.done}/${ev.total} claims sent`
              : ev.note ?? "Bot round: abandoned claims rolling to the seller",
        );
      }
    },
    [router],
  );

  const { snap: liveSnap, connected } = useDropStream(fixture ? "" : drop, onEvent);
  const fixSnap = useMemo(() => {
    if (!fixture) return null;
    if (fixture === "waiting") return fixtureSnapshot({ claims: 0, startsIn: 5 });
    if (fixture === "rolled") return fixtureSnapshot({ head: 1, noShows: 1 });
    if (fixture === "sold") return fixtureSnapshot({ sold: true, head: 1 });
    return fixtureSnapshot({});
  }, [fixture]);
  const current = fixSnap ?? liveSnap;
  useEffect(() => {
    snapRef.current = current;
  }, [current]);
  const snap = paused ?? current;
  const disconnected = fixture === "disconnected" || (!fixture && !connected && !!snap);
  const chainSec = useChainClock(snap, now);

  const admin = async (path: string, label: string) => {
    if (!key) return setMsg("Presenter only: open the board with #key=… in the URL.");
    setBusy(label);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/${path}`, { method: "POST", headers: { "x-presenter-key": key, "content-type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok && r.status !== 202) setMsg(j.error ?? `failed (${r.status})`);
      else if (path === "start" && j.id) router.replace(`/board/${j.id}${window.location.hash}`);
    } catch {
      setMsg("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  };

  if (!snap || !snap.drop) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8">
        <Wordmark size={40} />
        <p className="text-lg text-ink-muted">{snap ? "No drop yet — press Start drop." : "Connecting to Monad…"}</p>
        {snap && key && (
          <button type="button" onClick={() => admin("start", "start")} className="h-10 rounded-lg bg-ink px-4 font-semibold text-canvas">
            Start drop
          </button>
        )}
      </main>
    );
  }

  const d = snap.drop;
  const piece = snap.pieces[featured] ?? snap.pieces[0];
  const holder = piece ? holderOf(piece) : null;
  const buyer = piece?.sold ? piece.queue.find((r) => r.status === "won") ?? null : null;
  const opensIn = d.startsAt - chainSec;
  const secsLeft = piece?.deadline ? piece.deadline - chainSec : 0;
  const mode = disconnected ? "disconnected" : opensIn > 0 ? "waiting" : piece?.sold ? "sold" : holder ? "holding" : "empty";
  // show the last torn stub and the line from the holder on
  const start = Math.max(0, (piece?.head ?? 0) - 1);
  const rows: ClaimRow[] = piece ? piece.queue.slice(start, start + VISIBLE) : [];
  const more = piece ? Math.max(0, piece.queue.length - start - VISIBLE) : 0;
  const held = snap.pieces.reduce((s, p) => s + p.queue.filter((r) => r.status === "waiting" || r.status === "holding").length, 0) * Number(d.deposit);
  const joinUrl = `${origin}/d/latest`;
  const shortUrl = joinUrl.replace(/^https?:\/\//, "");

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex min-h-16 flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-8 py-2">
        <Link href="/" aria-label="Dibs home">
          <Wordmark size={30} />
        </Link>
        <div className="flex items-center gap-2.5 text-base">
          <span className="font-semibold">pocket.thrift</span>
          <span className="rounded-full bg-surface-1 px-2 py-0.5 text-[13px] text-ink-muted">demo store</span>
          <span className="text-ink-muted">
            Drop #{d.id}, {d.pieceCount} {d.pieceCount === 1 ? "piece" : "pieces"}
          </span>
          {d.synthetic && <span className="rounded-full bg-ink px-2.5 py-0.5 text-[13px] font-semibold text-canvas">Bot round — synthetic</span>}
          {fixture && <span className="text-[13px] text-ink-muted">· preview: {fixture}</span>}
        </div>
        <span className="flex-1" />
        <div className="flex items-center gap-2 text-[15px] text-ink-muted">
          <span key={blink} aria-hidden className={`h-2 w-2 rounded-full ${disconnected ? "bg-danger" : "bg-success blink"}`} />
          <span>{disconnected ? "Reconnecting to Monad…" : "Monad testnet"}</span>
          <span className="mono font-medium text-ink">block {fmtNum(snap.head.block)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-disabled={(!!busy || (opensIn > 0 && !d.synthetic)) || undefined}
            onClick={() => !busy && admin("start", "start")}
            className="h-10 rounded-lg bg-ink px-4 text-[15px] font-semibold text-canvas"
          >
            {busy === "start" ? "Starting…" : "Start drop"}
          </button>
          <button
            type="button"
            onClick={() => !busy && admin("bots", "bots")}
            className="h-10 rounded-lg bg-surface-1 px-4 text-[15px] font-semibold"
          >
            {busy === "bots" ? "Starting bots…" : "Run bot round"}
          </button>
          {d.synthetic && (
            <Link href={`/board/latest${key ? `#key=${encodeURIComponent(key)}` : ""}`} className="flex h-10 items-center rounded-lg bg-surface-1 px-4 text-[15px] font-semibold">
              Back to the room&apos;s drop
            </Link>
          )}
          <button type="button" onClick={() => setPaused((p) => (p ? null : current))} className="h-10 rounded-lg bg-surface-1 px-4 text-[15px] font-semibold">
            {paused ? "Resume feed" : "Pause feed"}
          </button>
          <button
            type="button"
            aria-pressed={sound}
            aria-label={sound ? "Sound on — turn off the holder chime" : "Sound off — turn on the holder chime"}
            onClick={() => {
              setSound((s) => !s);
              if (!sound) chime();
            }}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-1"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 5 6 9H3v6h3l5 4z" />
              {sound ? <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /> : <path d="m22 9-6 6M16 9l6 6" />}
            </svg>
          </button>
        </div>
        {msg && <p className="w-full text-sm font-semibold text-danger">{msg}</p>}
      </header>

      <main className={`flex flex-1 flex-wrap gap-8 px-8 py-5 ${disconnected ? "stale" : ""}`}>
        <section aria-label="Join and the piece" className="flex max-w-[420px] flex-[1_1_340px] flex-col gap-5">
          <div className="flex items-center gap-5">
            <div className="shrink-0 rounded-lg border-2 border-ink bg-white p-1.5">
              {origin && <QRCodeSVG value={joinUrl} size={150} level="M" aria-label="QR code to join the drop" />}
            </div>
            <div className="flex flex-col gap-2">
              <span className="display text-[22px] leading-tight">Scan to join the drop</span>
              <span className="mono break-all text-[15px] text-ink-muted">{shortUrl}</span>
              <span className="text-[15px] text-ink-muted">No sign-in. A wallet is made for you, with test money.</span>
            </div>
          </div>

          {piece && (
            <article aria-label={piece.name} className="flex flex-col">
              <div className="relative h-[230px] overflow-hidden rounded-t-[14px] bg-surface-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={piece.photo} alt={`${piece.name} (illustration)`} className="h-full w-full object-contain" />
                <span
                  className="absolute right-3.5 top-3.5 rounded-full px-2.5 py-1 text-[15px] font-bold"
                  style={{ background: piece.sold ? "var(--ink)" : opensIn > 0 ? "var(--led-bg)" : "var(--success)", color: opensIn > 0 && !piece.sold ? "var(--led)" : "#fff" }}
                >
                  {piece.sold ? "SOLD" : opensIn > 0 ? <span className="led">{fmtClock(opensIn)}</span> : "LIVE"}
                </span>
                {piece.sold && <SoldMark label={buyer ? `SOLD to ${buyer.nick}` : "SOLD"} />}
              </div>
              <HangTag className="-mt-9 ml-[18px] w-[86%] px-[18px] pb-3.5 pt-[24px]">
                <div className="display text-[26px] leading-tight">{piece.name}</div>
                <div className="tabular mt-1.5 flex gap-4 whitespace-nowrap text-lg">
                  <span>Size {piece.size}</span>
                  <span className="font-bold">{fmtNum(d.price)} tINR</span>
                  <span className="text-tag-ink-muted">deposit {fmtNum(d.deposit)}, priced by record</span>
                </div>
              </HangTag>
            </article>
          )}

          {snap.pieces.length > 1 && (
            <div className="flex flex-col gap-2.5">
              <span className="text-sm font-semibold text-ink-muted">Also in this drop</span>
              {snap.pieces.map((p) => {
                if (p === piece) return null;
                const h = holderOf(p);
                const b = p.sold ? p.queue.find((r) => r.status === "won") : null;
                return (
                  <button key={p.index} type="button" onClick={() => setFeatured(p.index)} className="flex items-center gap-3 text-left text-base">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.photo} alt="" className="h-11 w-11 rounded-lg bg-surface-1 object-cover" />
                    <span className="flex-1">
                      <b>{p.name}</b> · {p.size}
                    </span>
                    <span className="tabular text-ink-muted">
                      {b ? `SOLD to #${b.position + 1}` : h ? `Holding: ${String(h.position + 1).padStart(2, "0")} · ${fmtClock(p.deadline - chainSec)}` : `${p.queue.length} called dibs`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section aria-label={`${piece?.name ?? "The piece"}'s line`} className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <LedPanel
            mode={mode}
            holder={holder}
            buyer={buyer}
            secsLeft={secsLeft}
            payWindow={d.payWindow}
            price={d.price}
            deposit={d.deposit}
            opensAt={d.startsAt}
            opensIn={opensIn}
          />
          <div className="flex items-baseline justify-between">
            <span className="label-caps text-[15px]">Called dibs</span>
            <span className="tabular text-[17px] text-ink-muted">
              {fmtNum(piece?.queue.length ?? 0)} called dibs · chain order: block, then position in block
            </span>
          </div>
          <ol className="m-0 flex list-none flex-col p-0">
            {rows.length === 0 && <li className="perf py-3 text-lg text-ink-muted">{opensIn > 0 ? `Dibs opens in ${fmtClock(opensIn)}` : "Be first to call dibs."}</li>}
            {rows.map((r) => (
              <LineRow key={`${r.position}:${r.addr}`} row={r} base={d.deposit} torn={torn.has(`${piece!.index}:${r.addr}`)} />
            ))}
          </ol>
          {more > 0 && <span className="text-[17px] text-ink-muted">+{fmtNum(more)} more</span>}
          <div className="mt-auto flex flex-wrap items-baseline gap-6 border-t border-line pt-3.5">
            <span className="label-caps text-[15px]">Seller balance</span>
            <span className="display tabular text-[30px]">{fmtNum(Math.round(Number(snap.seller.balance)))} tINR</span>
            {lastForfeit && (
              <a
                key={lastForfeit.at}
                href={lastForfeit.tx ? txUrl(lastForfeit.tx) : undefined}
                target="_blank"
                rel="noreferrer"
                className="chip-up rounded-full bg-surface-1 px-3 py-1 text-[17px] font-semibold no-underline"
              >
                +{fmtNum(lastForfeit.amount)} from ghost {lastForfeit.nick} ↗
              </a>
            )}
            <span className="text-[17px] text-ink-muted">Deposits held by the contract: {fmtNum(held)} tINR</span>
          </div>
        </section>
      </main>

      <StatsStrip stats={snap.stats} synthetic={d.synthetic} bots={bots} />
    </div>
  );
}
