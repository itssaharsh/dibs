"use client";
import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { addressUrl, txUrl } from "@/lib/chain";
import { depositFor, recordText } from "@/lib/record";
import { mineIn } from "@/lib/stream-types";
import { useBurner } from "@/lib/useBurner";
import { fmtNum, useDropStream } from "@/lib/useDropStream";

const LABEL = { waiting: "Called dibs — waiting", holding: "First dibs — pay now", "no-show": "Ghosted — deposit to the seller", won: "Bought", refunded: "Deposit back" } as const;

/** The buyer's artifact: their record across every Dibs store, and this drop's calls, each linked to MonadVision. */
export function Ticket({ drop }: { drop: string }) {
  const { account, record } = useBurner();
  const me = account?.address ?? null;
  const { snap } = useDropStream(drop);
  const d = snap?.drop;
  const base = d ? Number(d.deposit) : 50;
  const mine = (snap?.pieces ?? []).map((p) => ({ p, r: mineIn(p, me) })).filter((x) => x.r);
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col gap-4 px-4 pb-10">
      <header className="flex h-[52px] items-center">
        <Link href={`/d/${drop}`} aria-label="Back to the drop">
          <Wordmark size={22} />
        </Link>
      </header>
      <h1 className="display m-0 text-xl">Your record</h1>
      <section className="hangtag flex flex-col gap-1 px-4 pb-4 pt-7">
        <span className="display text-2xl">{recordText(record)}</span>
        <span>
          Your deposit at the next Dibs store: <b className="tabular">{fmtNum(depositFor(base, d ? Number(d.price) : 450, record))} tINR</b>{" "}
          <span className="text-tag-ink-muted">(new buyers: {fmtNum(base)})</span>
        </span>
        <span className="text-sm text-tag-ink-muted">
          Kept by the DropHouse contract from its own outcomes — paid in time, or window lapsed. No store can edit it.
        </span>
        {me && (
          <a href={addressUrl(me)} target="_blank" rel="noreferrer" className="text-sm font-semibold underline">
            Your wallet on MonadVision ↗
          </a>
        )}
      </section>
      <h2 className="m-0 text-base font-semibold">This drop · #{d?.id ?? drop}</h2>
      {!snap ? (
        <p className="text-ink-muted">Loading…</p>
      ) : mine.length === 0 ? (
        <p className="text-ink-muted">You haven&apos;t called dibs in this drop yet.</p>
      ) : (
        mine.map(({ p, r }) => (
          <article key={p.index} className="perf flex flex-col gap-0.5 pt-2">
            <span className="font-semibold">
              #{r!.position + 1} · {p.name} · deposit {fmtNum(r!.deposit)} tINR
            </span>
            <span className="mono text-sm">
              block {fmtNum(r!.block)}
              {r!.txIndex >= 0 ? ` · #${r!.txIndex + 1} in block` : ""}
            </span>
            <span className="text-sm">{LABEL[r!.status]}</span>
            <a href={r!.tx ? txUrl(r!.tx) : addressUrl(r!.addr)} target="_blank" rel="noreferrer" className="text-sm font-semibold underline">
              Open on MonadVision ↗
            </a>
          </article>
        ))
      )}
      <p className="text-xs text-ink-muted">Test money (tINR) on Monad testnet. Nothing real is sold.</p>
    </div>
  );
}
