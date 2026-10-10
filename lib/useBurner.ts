"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Hex, LocalAccount } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { BuyerRecord } from "@/lib/record";

export type WalletStatus = "setup" | "ready" | "error";
const KEY = "dibs.pk";

/** Burner wallet in localStorage, funded once by /api/wallet; tracks tx and permit nonces locally. */
export function useBurner() {
  const [account, setAccount] = useState<LocalAccount | null>(null);
  const [status, setStatus] = useState<WalletStatus>("setup");
  const [error, setError] = useState<string | null>(null);
  const nonces = useRef({ nonce: 0, permitNonce: 0 });
  const [record, setRecord] = useState<BuyerRecord>({ paid: 0, ghosts: 0 });

  const sync = useCallback(async (acct: LocalAccount) => {
    const r = await fetch("/api/wallet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: acct.address }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "wallet setup failed");
    nonces.current = { nonce: j.nonce, permitNonce: j.permitNonce };
    if (j.record) setRecord(j.record);
    return j;
  }, []);

  const setup = useCallback(async () => {
    try {
      let pk: string | null = null;
      try {
        pk = localStorage.getItem(KEY);
      } catch {}
      if (!pk) {
        pk = generatePrivateKey();
        try {
          localStorage.setItem(KEY, pk);
        } catch {}
      }
      const acct = privateKeyToAccount(pk as Hex);
      setAccount(acct);
      await sync(acct);
      setStatus("ready");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  }, [sync]);

  useEffect(() => {
    const t = setTimeout(() => void setup(), 0);
    return () => clearTimeout(t);
  }, [setup]);

  const retry = useCallback(() => {
    setStatus("setup");
    setError(null);
    void setup();
  }, [setup]);

  /** Reserve the next nonces for one tx (permit nonce only when the tx carries a permit). */
  const take = useCallback((withPermit: boolean) => {
    const n = { ...nonces.current };
    nonces.current = { nonce: n.nonce + 1, permitNonce: n.permitNonce + (withPermit ? 1 : 0) };
    return n;
  }, []);

  const resync = useCallback(async () => {
    if (account) await sync(account).catch(() => undefined);
  }, [account, sync]);

  return { account, status, error, retry, take, resync, record, setRecord };
}

export type SendResult = { ok: true; hash: Hex } | { ok: false; status: number; error: string };

/** POST a signed tx to the relay. Network errors and 5xx retry the SAME bytes (never a second claim). */
export async function sendRaw(raw: Hex, onRetry?: (attempt: number) => void): Promise<SendResult> {
  let last: SendResult = { ok: false, status: 0, error: "Couldn't reach Monad" };
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) onRetry?.(attempt);
    try {
      const r = await fetch("/api/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ raw }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.hash) return { ok: true, hash: j.hash };
      last = { ok: false, status: r.status, error: j.error ?? `relay ${r.status}` };
      if (r.status < 500 && r.status !== 429) return last;
    } catch {
      last = { ok: false, status: 0, error: "Couldn't reach Monad" };
    }
    await new Promise((res) => setTimeout(res, 600 * attempt));
  }
  return last;
}

/** Ask the server how a sent tx ended (used only when the stream hasn't shown it). */
export async function txStatus(hash: string): Promise<{ status: "pending" | "success" | "reverted"; reason?: string }> {
  try {
    const r = await fetch(`/api/send?hash=${hash}`);
    return await r.json();
  } catch {
    return { status: "pending" };
  }
}
