"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Hex } from "viem";
import { DibsButton } from "@/components/DibsButton";
import { HangTag, SoldMark } from "@/components/HangTag";
import { Wordmark } from "@/components/Wordmark";
import { BUYER_STATES, buyerState, type BuyerState, type Pending } from "@/lib/buyer-state";
import { addressUrl, txUrl } from "@/lib/chain";
import { FIXTURE_ME, fixtureSnapshot } from "@/lib/fixtures";
import { depositFor, recordText, type BuyerRecord } from "@/lib/record";
import { holderOf, mineIn, type PieceState, type Snapshot, type StreamEvent } from "@/lib/stream-types";
import { buildClaim, buildPay, buildWithdraw } from "@/lib/tx";
import { sendRaw, txStatus, useBurner } from "@/lib/useBurner";
import { fmtClock, fmtNum, useChainClock, useDropStream, useNow } from "@/lib/useDropStream";

type PendingTx = NonNullable<Pending> & { raw?: Hex; sentAt?: number; note?: string };

const reasonCopy = (reason: string, kind: PendingTx["kind"]) => {
  if (/already claimed/.test(reason)) return "You already called dibs on this piece.";
  if (/\bsold\b/.test(reason)) return "This piece is sold.";
  if (/too late/.test(reason)) return "Too late — the piece moved on.";
  if (/not started/.test(reason)) return "The drop hasn't opened yet.";
  if (kind === "claim") return `Your claim didn't go through: ${reason}. No deposit was taken.`;
  return `That didn't go through: ${reason}.`;
};

export function Buyer({ drop, fixture }: { drop: string; fixture: string | null }) {
  const live = !fixture;
  const burner = useBurner();
  const meRef = useRef<string | undefined>(undefined);
  const { setRecord } = burner;
  // the record moves with my own outcomes: paying on time or ghosting changes my deposit at every Dibs store
  const onStream = useCallback(
    (ev: StreamEvent) => {
      const mine = meRef.current && "addr" in ev && ev.addr.toLowerCase() === meRef.current.toLowerCase();
      if (!mine) return;
      if (ev.type === "paid") setRecord((r) => ({ ...r, paid: r.paid + 1 }));
      if (ev.type === "forfeited") setRecord((r) => ({ ...r, ghosts: r.ghosts + 1 }));
    },
    [setRecord],
  );
  const { snap: liveSnap, connected } = useDropStream(live ? drop : "", onStream);
  const now = useNow(250);
  const [featured, setFeatured] = useState(0);
  const [pending, setPending] = useState<Record<number, PendingTx | null>>({});
  const [reason, setReason] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  const fixtureState = fixture && (BUYER_STATES as string[]).includes(fixture) ? (fixture as BuyerState) : null;
  const snap: Snapshot | null = useMemo(() => {
    if (!fixture) return liveSnap;
    if (fixtureState === "pre-drop") return fixtureSnapshot({ startsIn: 12 });
    if (fixtureState === "sold-out" || fixtureState === "sold-to-other" || fixtureState === "withdrawn" || fixtureState === "withdrawing")
      return fixtureSnapshot({ sold: true, head: 1 });
    if (fixtureState === "bought") return fixtureSnapshot({ sold: true, head: 3 });
    if (fixtureState === "your-turn" || fixtureState === "paying" || fixtureState === "no-show") return fixtureSnapshot({ head: 3 });
    return fixtureSnapshot({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixture, liveSnap]);

  const chainSec = useChainClock(snap, now);
  const nowSec = Math.floor(chainSec);
  const me = fixture ? FIXTURE_ME : burner.account?.address;
  useEffect(() => {
    meRef.current = me;
  }, [me]);
  const pieces = useMemo(() => snap?.pieces ?? [], [snap]);
  const piece: PieceState | undefined = pieces[featured] ?? pieces[0];
  const d = snap?.drop ?? null;

  const stateFor = useCallback(
    (p: PieceState | undefined): BuyerState => {
      if (fixtureState && p === piece) return fixtureState;
      return buyerState({ wallet: fixture ? "ready" : burner.status, drop: d, piece: p, me, pending: p ? pending[p.index] ?? null : null, nowSec });
    },
    [fixtureState, piece, fixture, burner.status, d, me, pending, nowSec],
  );
  const state = stateFor(piece);
  const mine = piece ? mineIn(piece, me) : null;
  const holder = piece ? holderOf(piece) : null;
  const ahead = mine && piece ? Math.max(0, mine.position - piece.head) : 0;
  const secsLeft = piece && piece.deadline ? piece.deadline - chainSec : 0;
  const base = d ? Number(d.deposit) : 50;
  const record: BuyerRecord = fixture ? { paid: 0, ghosts: 0 } : burner.record;
  const nextDeposit = d ? depositFor(base, Number(d.price), record) : base;
  const myDeposit = mine ? Number(mine.deposit) : nextDeposit; // what I put down here, or would
  const deposit = fmtNum(myDeposit);
  const price = d ? fmtNum(d.price) : "450";
  const rest = d ? fmtNum(Number(d.price) - myDeposit) : "400";
  const opensIn = d ? d.startsAt - chainSec : 0;

  // clear a pending tx once the stream shows its effect
  useEffect(() => {
    if (fixture) return;
    setPending((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const p of pieces) {
        const pd = prev[p.index];
        if (!pd || pd.error) continue;
        const m = mineIn(p, me);
        const done =
          (pd.kind === "claim" && m) || (pd.kind === "pay" && m?.status === "won") || (pd.kind === "withdraw" && m?.status === "refunded");
        if (done) {
          next[p.index] = null;
          changed = true;
          if (pd.kind === "claim" && m) setAnnounce(`You called dibs: number ${m.position + 1} for ${p.name}.`);
        }
      }
      return changed ? next : prev;
    });
  }, [pieces, me, fixture]);

  // a pending tx the stream hasn't shown: ask the server at 4 s, re-send the SAME bytes at 8 s
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => {
    if (fixture) return;
    const t = setInterval(async () => {
      for (const [k, pd] of Object.entries(pendingRef.current)) {
        if (!pd || pd.error || !pd.hash || !pd.sentAt) continue;
        const age = Date.now() - pd.sentAt;
        if (age > 4_000) {
          const s = await txStatus(pd.hash);
          if (s.status === "reverted") {
            setPending((p) => ({ ...p, [k]: { ...pd, error: reasonCopy(s.reason ?? "reverted", pd.kind) } }));
            void burner.resync();
            continue;
          }
          if (s.status === "success") continue; // the stream will catch up
        }
        if (age > 8_000 && pd.raw && (pd.note?.match(/\((\d)\/3\)/)?.[1] ?? "1") < "3") {
          const attempt = Number(pd.note?.match(/\((\d)\/3\)/)?.[1] ?? 1) + 1;
          setPending((p) => ({ ...p, [k]: { ...pd, sentAt: Date.now(), note: `Couldn't reach Monad. Retrying (${attempt}/3)…` } }));
          void sendRaw(pd.raw);
        }
      }
    }, 2_000);
    return () => clearInterval(t);
  }, [fixture, burner]);

  const act = useCallback(
    async (p: PieceState, kind: PendingTx["kind"]) => {
      if (!burner.account || !d) return;
      const n = burner.take(kind !== "withdraw");
      const fees = { baseFee: snap ? BigInt(snap.head.baseFee) : undefined };
      setPending((x) => ({ ...x, [p.index]: { kind } }));
      try {
        const built =
          kind === "claim"
            ? await buildClaim(burner.account, { dropId: d.id, piece: p.index, deposit: d.deposit, ...n }, fees)
            : kind === "pay"
              ? await buildPay(burner.account, { dropId: d.id, piece: p.index, price: d.price, deposit: d.deposit, ...n }, fees)
              : await buildWithdraw(burner.account, { dropId: d.id, piece: p.index, nonce: n.nonce }, fees);
        setPending((x) => ({ ...x, [p.index]: { kind, hash: built.hash, raw: built.raw, sentAt: Date.now() } }));
        const r = await sendRaw(built.raw, (attempt) =>
          setPending((x) => ({ ...x, [p.index]: { kind, hash: built.hash, raw: built.raw, sentAt: Date.now(), note: `Couldn't reach Monad. Retrying (${attempt}/3)…` } })),
        );
        if (!r.ok) {
          setPending((x) => ({ ...x, [p.index]: { kind, error: reasonCopy(r.error, kind) } }));
          void burner.resync();
        }
      } catch (e) {
        setPending((x) => ({ ...x, [p.index]: { kind, error: reasonCopy((e as Error).message.slice(0, 80), kind) } }));
        void burner.resync();
      }
    },
    [burner, d, snap],
  );

  const press = (p: PieceState | undefined, st: BuyerState) => {
    setReason(null);
    if (!p || fixture) return;
    if (p !== piece) setFeatured(p.index);
    switch (st) {
      case "live":
        return void act(p, "claim");
      case "your-turn":
        return void act(p, "pay");
      case "sold-to-other":
        return void act(p, "withdraw");
      case "error":
        setPending((x) => ({ ...x, [p.index]: null }));
        return;
      case "wallet-setup":
        if (burner.status === "error") void burner.retry();
        return setReason(burner.status === "error" ? "Couldn't set up your wallet — retrying." : "Setting up your wallet with test money…");
      case "pre-drop":
        return setReason("The drop isn't open yet. The button turns pink when it opens.");
      case "sold-out":
        return setReason("This piece is sold.");
      case "in-line":
        return setReason("You already called dibs on this piece.");
      default:
        return;
    }
  };

  const label = (st: BuyerState, p: PieceState | undefined): string => {
    const m = p ? mineIn(p, me) : null;
    const left = p && p.deadline ? p.deadline - chainSec : 0;
    switch (st) {
      case "wallet-setup":
        return burner.status === "error" && !fixture ? "Try again" : "Setting up…";
      case "pre-drop":
        return `Opens in ${fmtClock(opensIn)}`;
      case "live":
        return "DIBS";
      case "claiming":
        return "Calling dibs…";
      case "in-line":
        return m ? `You're #${m.position + 1} · block ${fmtNum(m.block)}` : "In line";
      case "your-turn":
        return `PAY ${rest} tINR · ${fmtClock(left)}`;
      case "paying":
        return "Paying…";
      case "bought":
        return "It's yours ✓";
      case "no-show":
        return "Time ran out";
      case "sold-to-other":
        return `Withdraw ${deposit} tINR`;
      case "withdrawing":
        return "Withdrawing…";
      case "withdrawn":
        return "Deposit back";
      case "sold-out":
        return "Sold out";
      case "error":
        return "Try again";
    }
  };

  const walletChip = fixture
    ? "Ready ✓"
    : burner.status === "ready"
      ? "Ready ✓"
      : burner.status === "error"
        ? "Couldn't set up your wallet — tap to retry"
        : "Setting up…";

  const pd = piece ? pending[piece.index] : null;
  const errorLine = state === "error" ? pd?.error ?? "Something went wrong." : null;
  const noteLine = pd?.note && !pd.error ? pd.note : null;

  const statusLine = (() => {
    if (!piece) return null;
    const count = piece.queue.length;
    if (piece.sold) {
      const b = piece.queue.find((r) => r.status === "won");
      return b ? `Sold to #${b.position + 1} (${b.nick})` : "Sold";
    }
    if (mine && state === "in-line") return `You're #${mine.position + 1} — ${ahead} ahead of you`;
    if (holder) return `${fmtNum(count)} called dibs · #${holder.position + 1} pays in ${fmtClock(secsLeft)}`;
    if (count) return `${fmtNum(count)} called dibs`;
    return "Be first to call dibs";
  })();

  const consequence =
    state === "your-turn"
      ? `If you don't pay in ${fmtClock(secsLeft)}, your ${deposit} deposit goes to the seller and your deposit doubles at every Dibs store${piece && piece.queue.length > (mine?.position ?? 0) + 1 ? ` and #${(mine?.position ?? 0) + 2} is up` : ""}.`
      : state === "no-show"
        ? `You ghosted: your ${deposit} tINR deposit goes to the seller. Your deposit is now ${fmtNum(
            // the clock can show the lapse a moment before the chain records it: count this ghost either way
            d ? depositFor(base, Number(d.price), { ...record, ghosts: record.ghosts + (mine?.status === "no-show" ? 0 : 1) }) : base,
          )} at every Dibs store.`
        : state === "sold-to-other" && piece
          ? `Sold to #${(piece.queue.find((r) => r.status === "won")?.position ?? 0) + 1} (${piece.queue.find((r) => r.status === "won")?.nick ?? "another buyer"}). Your ${deposit} tINR deposit is waiting.`
          : null;

  const others = pieces.filter((p) => p !== piece);

  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-canvas pb-[calc(128px+env(safe-area-inset-bottom))]">
      <div role="status" aria-live="polite" className="sr-only">
        {announce}
      </div>
      <header className="flex h-[52px] items-center gap-2 px-4">
        <Link href="/" aria-label="Dibs home">
          <Wordmark size={22} />
        </Link>
        <span className="flex-1" />
        <span className="rounded-full bg-surface-1 px-2 py-[3px] text-xs text-ink-muted">Monad testnet</span>
        <button
          type="button"
          onClick={() => burner.status === "error" && burner.retry()}
          className="text-[13px] font-semibold"
          style={{ color: walletChip.startsWith("Ready") ? "var(--success)" : "var(--ink-muted)" }}
        >
          {walletChip}
        </button>
      </header>

      <div className={`flex flex-col gap-1.5 px-4 pt-1 ${live && !connected && snap ? "stale" : ""}`}>
        <div className="flex items-center gap-2 text-base">
          <span className="font-bold">pocket.thrift</span>
          <span className="rounded-full bg-surface-1 px-2 py-0.5 text-xs text-ink-muted">demo store</span>
          {d && <span className="text-sm text-ink-muted">Drop #{d.id}{d.synthetic ? " · Bot round — synthetic" : ""}</span>}
          {fixture && <span className="text-xs text-ink-muted">· preview: {fixture}</span>}
        </div>
        <p className="m-0 text-[15px] leading-snug text-ink-muted">
          {consequence ??
            `First dibs has ${d?.payWindow ?? 60} s to pay. Ghost, and your deposit goes to the seller.`}
        </p>
        {d && (
          <div className="flex flex-wrap items-baseline gap-x-2 rounded-lg bg-surface-1 px-3 py-2 text-[14px]">
            <span>
              Your deposit here: <b className="tabular">{fmtNum(myDeposit)} tINR</b>
              {myDeposit !== base && <span className="text-ink-muted"> (new buyers: {fmtNum(base)})</span>}
            </span>
            <span className="text-ink-muted">· your record: {recordText(record)}</span>
            <span className="w-full text-[13px] text-ink-muted">Pay on time and it halves at every Dibs store. Ghost and it doubles.</span>
          </div>
        )}
      </div>

      {live && !connected && snap && <p className="px-4 pt-2 text-sm font-semibold text-ink">Reconnecting to Monad…</p>}

      {!snap ? (
        <div className="m-4 h-[380px] animate-pulse rounded-[14px] bg-surface-1" aria-label="Loading the drop" />
      ) : !piece ? (
        <p className="p-4 text-ink-muted">This drop doesn&apos;t exist yet. Ask the seller for the latest link.</p>
      ) : (
        <>
          <article aria-label={piece.name} className="relative mx-4 mt-3">
            <div className="relative overflow-hidden rounded-[14px] bg-surface-1" style={{ aspectRatio: "4 / 4.3" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={piece.photo} alt={`${piece.name}, size ${piece.size} (illustration)`} className="h-full w-full object-cover" />
              <span
                className="absolute right-3 top-3 rounded-full px-2.5 py-0.5 text-[13px] font-bold"
                style={{
                  background: piece.sold ? "var(--ink)" : opensIn > 0 ? "var(--surface-2)" : "var(--success)",
                  color: piece.sold ? "#fff" : opensIn > 0 ? "var(--ink)" : "#fff",
                }}
              >
                {piece.sold ? "SOLD" : opensIn > 0 ? `Opens in ${fmtClock(opensIn)}` : "LIVE"}
              </span>
              {piece.sold && <SoldMark label={mine?.status === "won" ? "YOURS" : "SOLD"} />}
            </div>
            <HangTag className="absolute -bottom-7 left-3 w-[72%] px-3.5 pb-3 pt-[22px]">
              <div className="display text-[21px] leading-tight">{piece.name}</div>
              <div className="tabular mt-1.5 flex gap-3 text-[15px]">
                <span>{piece.size}</span>
                <span className="font-bold">{price} tINR</span>
                <span className="text-tag-ink-muted">your deposit {deposit}</span>
              </div>
            </HangTag>
          </article>

          <div className="tabular mx-4 mt-10 flex justify-between text-[15px]">
            <span className={mine ? "font-bold" : ""}>{statusLine}</span>
          </div>

          {mine && (
            <div className="perf mx-4 mt-3 flex items-center justify-between gap-3 bg-surface-1 px-3 py-3 text-[15px]" style={{ borderTop: "2px dashed var(--line-input)" }}>
              <span className="tabular min-w-0 truncate whitespace-nowrap">
                <b>#{mine.position + 1}</b> · <span className="mono text-[13px]">block {fmtNum(mine.block)}</span>
                {mine.txIndex >= 0 && <span className="text-ink-muted"> · #{mine.txIndex + 1} in block</span>}
              </span>
              <a
                href={mine.tx ? txUrl(mine.tx) : addressUrl(mine.addr)}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-sm font-semibold underline"
              >
                MonadVision ↗
              </a>
            </div>
          )}

          {others.length > 0 && (
            <div className="mx-4 mt-5 flex flex-col gap-2.5">
              <span className="text-[13px] font-semibold text-ink-muted">Also in this drop</span>
              {others.map((p) => {
                const st = stateFor(p);
                const m = mineIn(p, me);
                return (
                  <div key={p.index} className="flex items-center gap-2.5 text-[15px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.photo} alt="" className="h-12 w-12 shrink-0 rounded-lg bg-surface-1 object-cover" />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setFeatured(p.index)}>
                      <b>{p.name}</b>{" "}
                      <span className="text-ink-muted">
                        {p.sold ? "sold" : m ? `you're #${m.position + 1}` : `${p.queue.length} called dibs`}
                      </span>
                    </button>
                    <DibsButton compact state={st} label={st === "live" ? "Dibs" : st === "your-turn" ? "Pay" : st === "sold-to-other" ? "Withdraw" : label(st, p).split(" · ")[0]} onPress={() => press(p, st)} />
                  </div>
                );
              })}
            </div>
          )}
          <Link href={`/d/${d?.id ?? drop}/ticket`} className="mx-4 mt-5 text-sm text-ink-muted underline">
            Your record across Dibs stores
          </Link>
        </>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[480px] bg-canvas px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3" style={{ boxShadow: "0 -8px 16px -8px rgb(26 23 20 / .12)" }}>
        {(reason || errorLine || noteLine) && (
          <p id="dibs-reason" className="mb-2 text-center text-sm font-semibold" style={{ color: errorLine ? "var(--danger)" : "var(--ink)" }}>
            {errorLine ?? noteLine ?? reason}
          </p>
        )}
        <DibsButton state={state} label={label(state, piece)} onPress={() => press(piece, state)} blockedReason={reason} />
        <p className="mt-2 text-center text-xs text-ink-muted">Test money (tINR) on Monad testnet. Nothing real is sold.</p>
      </div>
    </div>
  );
}
