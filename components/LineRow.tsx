import { addressUrl, txUrl } from "@/lib/chain";
import type { ClaimRow } from "@/lib/stream-types";
import { fmtNum } from "@/lib/useDropStream";

/** C-02: one ticket stub in a piece's line. */
export function LineRow({ row, deposit, torn }: { row: ClaimRow; deposit: string; torn?: boolean }) {
  const holding = row.status === "holding";
  const noShow = row.status === "no-show";
  return (
    <li
      className={`perf relative flex h-11 items-center gap-4 pl-3 text-[22px] ${torn ? "torn" : "snap-in"}`}
      style={{ opacity: noShow ? 0.55 : 1 }}
    >
      {holding && <span aria-hidden className="absolute bottom-1 left-0 top-1 w-1.5 rounded-sm bg-accent" />}
      <span className="mono w-12 font-bold tabular">{String(row.position + 1).padStart(2, "0")}</span>
      <span className={`min-w-0 flex-1 truncate ${holding ? "font-bold" : "font-semibold"}`} style={{ textDecoration: noShow ? "line-through" : undefined }}>
        {row.nick}
      </span>
      {noShow && <span className="text-base text-ink-muted">No-show — {fmtNum(deposit)} to seller</span>}
      {row.status === "won" && <span className="text-base font-bold text-success">Bought ✓</span>}
      {row.status === "refunded" && <span className="text-base text-ink-muted">Deposit back</span>}
      <span className="mono hidden text-base text-ink-muted sm:inline">
        block {fmtNum(row.block)}
        {row.txIndex >= 0 ? ` · #${row.txIndex + 1} in block` : ""}
      </span>
      <a
        href={row.tx ? txUrl(row.tx) : addressUrl(row.addr)}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${row.nick}'s claim on MonadVision`}
        className="px-1 text-[17px] no-underline"
      >
        ↗
      </a>
    </li>
  );
}
