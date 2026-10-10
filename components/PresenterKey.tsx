"use client";
import { useState } from "react";

/** Presenter controls spend the demo's test MON, so they need the presenter key. This asks for it instead of failing. */
export function PresenterKey({ compact, label = "Unlock" }: { compact?: boolean; label?: string }) {
  const [open, setOpen] = useState(!compact);
  const [value, setValue] = useState("");
  const unlock = () => {
    const key = value.trim();
    if (!key) return;
    window.location.hash = `key=${encodeURIComponent(key)}`;
    window.location.reload();
  };
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-10 rounded-lg bg-surface-1 px-4 text-[15px] font-semibold">
        Presenter
      </button>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        unlock();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Presenter key"
        aria-label="Presenter key"
        autoComplete="off"
        className="h-10 min-w-0 flex-1 rounded-lg border border-line-input bg-canvas px-3 text-[15px]"
      />
      <button type="submit" className="h-10 rounded-lg bg-ink px-4 text-[15px] font-semibold text-canvas">
        {label}
      </button>
    </form>
  );
}
