"use client";
import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/** Read a browser-only value (URL hash, origin, localStorage) without a setState-in-effect round trip. */
export function useClientValue<T extends string | null>(get: () => T, server: T): T {
  return useSyncExternalStore(noSubscribe, get, () => server);
}

export const presenterKeyFromHash = () => {
  const m = /key=([^&]+)/.exec(window.location.hash);
  return m ? decodeURIComponent(m[1]) : null;
};
