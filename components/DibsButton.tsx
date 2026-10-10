"use client";
import type { BuyerState } from "@/lib/buyer-state";

type Props = {
  state: BuyerState;
  label: string;
  onPress: () => void;
  blockedReason?: string | null;
  compact?: boolean;
};

const PINK: BuyerState[] = ["live", "your-turn", "error", "claiming", "paying"];
const BLOCKED: BuyerState[] = ["wallet-setup", "pre-drop", "sold-out", "claiming", "paying", "withdrawing", "in-line", "bought", "no-show", "withdrawn"];

/** C-01: the price-sticker button. Blocked states stay focusable (aria-disabled) and explain why on tap. */
export function DibsButton({ state, label, onPress, blockedReason, compact }: Props) {
  const blocked = BLOCKED.includes(state);
  const pink = PINK.includes(state);
  const busy = state === "claiming" || state === "paying" || state === "withdrawing";
  if (compact) {
    return (
      <button
        type="button"
        aria-disabled={blocked || undefined}
        onClick={onPress}
        className="press display h-10 shrink-0 rounded-full px-4 text-sm"
        style={{ background: state === "live" ? "var(--accent)" : "var(--surface-1)", boxShadow: state === "live" ? "inset 0 0 0 2px var(--ink)" : undefined }}
      >
        {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-disabled={blocked || undefined}
      aria-describedby={blockedReason ? "dibs-reason" : undefined}
      onClick={onPress}
      className={`press flex h-16 w-full items-center justify-center gap-3 rounded-full px-5 ${pink ? "sticker" : "display"}`}
      style={
        pink
          ? { fontSize: label.length > 14 ? 20 : 26, letterSpacing: "0.02em" }
          : {
              background: state === "bought" ? "var(--success)" : state === "sold-to-other" ? "var(--surface-2)" : "var(--surface-1)",
              color: state === "bought" ? "#fff" : "var(--ink)",
              fontSize: label.length > 22 ? 17 : 20,
              boxShadow: "inset 0 0 0 2px var(--line)",
            }
      }
    >
      {busy && <span aria-hidden className="spin inline-block h-5 w-5 rounded-full border-[3px] border-ink border-t-transparent" />}
      <span className="truncate">{label}</span>
    </button>
  );
}
