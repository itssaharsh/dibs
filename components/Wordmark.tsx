export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-start" aria-label="dibs">
      <span className="display" style={{ fontSize: size, letterSpacing: "-0.03em", lineHeight: 1 }} aria-hidden>
        dibs
      </span>
      <span
        aria-hidden
        className="rounded-full"
        style={{ width: size * 0.4, height: size * 0.4, background: "var(--accent)", boxShadow: "inset 0 0 0 1.5px var(--ink)", marginLeft: 2, marginTop: -2 }}
      />
    </span>
  );
}
