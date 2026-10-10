import type { CSSProperties, ReactNode } from "react";

/** Kraft hang tag: clipped top corners, punched hole. */
export function HangTag({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`hangtag ${className}`} style={style}>
      {children}
    </div>
  );
}

export function SoldMark({ label = "SOLD" }: { label?: string }) {
  return (
    <span
      className="display pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-md px-4 py-1 text-ink"
      style={{ fontSize: 44, border: "4px solid var(--ink)", background: "rgb(255 255 255 / .85)" }}
    >
      {label}
    </span>
  );
}
