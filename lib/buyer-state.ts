// Pure: which state the buyer's button is in for one piece (UI-SPEC §8). Unit-tested; ?state= fixtures use it too.
import { holderOf, mineIn, type DropState, type PieceState } from "@/lib/stream-types";

export type BuyerState =
  | "wallet-setup" | "pre-drop" | "live" | "claiming" | "in-line" | "your-turn" | "paying"
  | "bought" | "no-show" | "sold-to-other" | "withdrawing" | "withdrawn" | "sold-out" | "error";

export const BUYER_STATES: BuyerState[] = [
  "wallet-setup", "pre-drop", "live", "claiming", "in-line", "your-turn", "paying",
  "bought", "no-show", "sold-to-other", "withdrawing", "withdrawn", "sold-out", "error",
];

export type Pending = { kind: "claim" | "pay" | "withdraw"; hash?: string; error?: string } | null;

export function buyerState(a: {
  wallet: "setup" | "ready" | "error";
  drop: DropState | null;
  piece: PieceState | undefined;
  me: string | null | undefined;
  pending: Pending;
  nowSec: number;
}): BuyerState {
  const { drop, piece, me, pending, nowSec } = a;
  if (pending?.error) return "error";
  const mine = piece ? mineIn(piece, me) : null;
  if (mine) {
    if (mine.status === "won") return "bought";
    if (mine.status === "no-show") return "no-show";
    if (mine.status === "refunded") return "withdrawn";
    if (piece!.sold) return pending?.kind === "withdraw" ? "withdrawing" : "sold-to-other";
    const h = holderOf(piece!);
    if (h && h.addr.toLowerCase() === mine.addr.toLowerCase()) {
      if (pending?.kind === "pay") return "paying";
      return piece!.deadline >= nowSec ? "your-turn" : "no-show";
    }
    return "in-line";
  }
  if (pending?.kind === "claim") return "claiming";
  if (a.wallet !== "ready") return "wallet-setup";
  if (!drop || !piece) return "wallet-setup";
  if (piece.sold) return "sold-out";
  if (nowSec < drop.startsAt) return "pre-drop";
  return "live";
}
