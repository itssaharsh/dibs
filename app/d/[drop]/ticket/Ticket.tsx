"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useClientValue } from "@/lib/useClient";
import { privateKeyToAccount } from "viem/accounts";
import { Wordmark } from "@/components/Wordmark";
import { addressUrl, txUrl } from "@/lib/chain";
import { mineIn } from "@/lib/stream-types";
import { fmtNum, useDropStream } from "@/lib/useDropStream";

const LABEL = { waiting: "In line", holding: "Holding — pay now", "no-show": "No-show — deposit to seller", won: "Bought", refunded: "Deposit back" } as const;

/** The buyer's artifact: one claim ticket per piece, each linked to MonadVision. */
export function Ticket({ drop }: { drop: string }) {
  const pk = useClientValue(() => {
    try {
      return localStorage.getItem("dibs.pk");
    } catch {
      return null;
    }
  }, null);
  const me = useMemo(() => (pk ? privateKeyToAccount(pk as `0x${string}`).address : null), [pk]);
  const { snap } = useDropStream(drop);
  const mine = (snap?.pieces ?? []).map((p) => ({ p, r: mineIn(p, me) })).filter((x) => x.r);
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col gap-4 px-4 pb-10">
      <header className="flex h-[52px] items-center">
        <Link href={`/d/${drop}`} aria-label="Back to the drop">
          <Wordmark size={22} />
        </Link>
      </header>
      <h1 className="display m-0 text-xl">Your claim tickets · Drop #{snap?.drop?.id ?? drop}</h1>
      {!snap ? (
        <p className="text-ink-muted">Loading…</p>
      ) : mine.length === 0 ? (
        <p className="text-ink-muted">No claims from this phone in this drop yet.</p>
      ) : (
        mine.map(({ p, r }) => (
          <article key={p.index} className="hangtag flex flex-col gap-1 px-4 pb-4 pt-7">
            <span className="display text-2xl">#{r!.position + 1} · {p.name}</span>
            <span className="mono text-sm">block {fmtNum(r!.block)}{r!.txIndex >= 0 ? ` · #${r!.txIndex + 1} in block` : ""}</span>
            <span className="font-semibold">{LABEL[r!.status]}</span>
            <a href={r!.tx ? txUrl(r!.tx) : addressUrl(r!.addr)} target="_blank" rel="noreferrer" className="font-semibold underline">
              Open on MonadVision ↗
            </a>
          </article>
        ))
      )}
      <p className="text-xs text-ink-muted">Test money (tINR) on Monad testnet. Nothing real is sold.</p>
    </div>
  );
}
