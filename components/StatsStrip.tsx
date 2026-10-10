import type { Stats } from "@/lib/stream-types";
import { fmtNum } from "@/lib/useDropStream";

/** C-05: proof of speed, straight from the stream. */
function Item({ v, l }: { v: string; l: string }) {
  return (
    <span>
      <b>{v}</b> <span className="text-ink-muted">{l}</span>
    </span>
  );
}

export function StatsStrip({ stats, synthetic, bots }: { stats: Stats; synthetic?: boolean; bots?: string | null }) {
  const blocks = stats.claims ? stats.lastBlock - stats.firstBlock + 1 : 0;
  return (
    <footer className="tabular flex min-h-16 flex-wrap items-center gap-x-8 gap-y-2 bg-surface-1 px-8 py-3 text-lg">
      {stats.claims === 0 ? (
        <span className="text-ink-muted">Waiting for the first claim</span>
      ) : (
        <>
          <Item v={fmtNum(stats.claims)} l="claims" />
          <Item v={fmtNum(blocks)} l={blocks === 1 ? "block" : "blocks"} />
          {stats.spanMs > 0 && <Item v={`${(stats.spanMs / 1000).toFixed(1)} s`} l="first → last block" />}
          {stats.medianSendToSeenMs > 0 && <Item v={`${(stats.medianSendToSeenMs / 1000).toFixed(1)} s`} l="tap → confirmed (median)" />}
          {stats.forfeits > 0 && (
            <Item v={fmtNum(stats.forfeits)} l={stats.forfeits === 1 ? "ghost paid the seller — their deposit just went up at every Dibs store" : "ghosts paid the seller — their deposits just went up at every Dibs store"} />
          )}
        </>
      )}
      <Item v="2 gwei" l="tip cap" />
      <span className="font-semibold">Fees can&apos;t buy a place</span>
      {stats.tipRefused > 0 && <span className="rounded-full bg-canvas px-3 py-1 font-semibold">{stats.tipRefused} over-cap tip refused</span>}
      {synthetic && <span className="rounded-full bg-ink px-3 py-1 text-sm font-semibold text-canvas">Bot round — {stats.claims > 0 ? `${fmtNum(stats.claims)} ` : ""}scripted wallets (synthetic)</span>}
      {bots && <span className="text-base text-ink-muted">{bots}</span>}
    </footer>
  );
}
