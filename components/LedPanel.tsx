import type { ClaimRow } from "@/lib/stream-types";
import { fmtClock, fmtNum } from "@/lib/useDropStream";

/** C-03: the token display. LED digits switch instantly; never animated. */
export function LedPanel(props: {
  mode: "waiting" | "holding" | "empty" | "sold" | "disconnected";
  holder?: ClaimRow | null;
  buyer?: ClaimRow | null;
  secsLeft?: number;
  payWindow?: number;
  price?: string;
  deposit?: string;
  opensAt?: number;
}) {
  const { mode, holder, buyer, secsLeft = 0, payWindow = 60, price = "450", deposit = "50", opensAt } = props;
  const pct = mode === "holding" ? Math.max(0, Math.min(100, (secsLeft / payWindow) * 100)) : 0;
  const digits = mode === "holding" && holder ? String(holder.position + 1).padStart(2, "0") : mode === "sold" && buyer ? String(buyer.position + 1).padStart(2, "0") : "--";
  const rest = fmtNum(Number(price) - Number(deposit));
  return (
    <div
      className={`flex flex-wrap items-center gap-7 rounded-[14px] bg-led-bg px-7 py-5 text-led-ink ${mode === "disconnected" ? "opacity-70" : ""}`}
      aria-live="polite"
      aria-label={mode === "holding" && holder ? `Now holding: number ${holder.position + 1}, ${holder.nick}` : undefined}
    >
      <div className="flex flex-col gap-1">
        <span className="label-caps text-[15px] text-led-label">{mode === "sold" ? "SOLD TO" : "NOW HOLDING"}</span>
        <span className="led leading-none" style={{ fontSize: "var(--b-digits)" }}>
          {digits}
        </span>
      </div>
      <div className="flex min-w-[220px] flex-1 flex-col gap-2.5">
        {mode === "holding" && holder ? (
          <>
            <span className="display text-[34px] leading-tight">{holder.nick}</span>
            <span className="text-[17px] text-led-label">
              has {payWindow} s to pay {rest} tINR more, or the {fmtNum(deposit)} deposit goes to the seller
            </span>
            <div aria-hidden className="h-2.5 rounded-full" style={{ background: "#2A2622" }}>
              <div className="h-2.5 rounded-full bg-led" style={{ width: `${pct}%` }} />
            </div>
          </>
        ) : mode === "sold" && buyer ? (
          <>
            <span className="display text-[34px] leading-tight">SOLD to {buyer.nick}</span>
            <span className="text-[17px] text-led-label">Paid {fmtNum(price)} tINR in time. Everyone else can take their deposit back.</span>
          </>
        ) : mode === "waiting" ? (
          <>
            <span className="display text-[30px] leading-tight">The line opens soon</span>
            <span className="text-[17px] text-led-label">
              {opensAt ? `The line opens at ${new Date(opensAt * 1000).toLocaleTimeString("en-IN", { hour12: false })}` : "Waiting for the drop"}
            </span>
          </>
        ) : mode === "disconnected" ? (
          <span className="display text-[28px] leading-tight">Reconnecting to Monad…</span>
        ) : (
          <>
            <span className="display text-[30px] leading-tight">No one holding</span>
            <span className="text-[17px] text-led-label">Be first in line — the first claim holds the piece.</span>
          </>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="label-caps text-[15px] text-led-label">{mode === "waiting" ? "OPENS IN" : "PAYS IN"}</span>
        <span className="led leading-none" style={{ fontSize: 72 }}>
          {mode === "holding" ? fmtClock(secsLeft) : mode === "waiting" && opensAt ? fmtClock(opensAt - Date.now() / 1000) : "-:--"}
        </span>
      </div>
    </div>
  );
}
