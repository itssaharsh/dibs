// Bot round — synthetic. 100 generated wallets claim the two other pieces at once and never pay;
// one more claims with a 100 gwei tip, which the contract refuses ("tip above cap").
import { parseEther, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createDrop } from "@/lib/admin";
import { publicClient } from "@/lib/chain";
import type { Indexer } from "@/lib/indexer";
import { errText, type Operator } from "@/lib/operator";
import { buildClaim } from "@/lib/tx";

export const BOT_COUNT = 100;
export const BOT_WINDOW = 3; // seconds: every abandoned claim rolls fast enough to watch
const BOT_GAS = parseEther("0.05");
const TIPPER_GAS = parseEther("0.1");
const BOT_TINR = parseEther("100");
const OVER_TIP = 100_000_000_000n; // 100 gwei, 50× the cap

/** Pure plan: which piece each bot claims (exported for the dry-run test). */
export function planBots(n = BOT_COUNT, pieces = 2) {
  return Array.from({ length: n }, (_, i) => ({ bot: i, piece: i % pieces }));
}

const g = globalThis as unknown as { __dibsBots?: { running: boolean; drop: number } };

export function botState() {
  return (g.__dibsBots ??= { running: false, drop: 0 });
}

export async function runBotRound(ix: Indexer, op: Operator): Promise<{ drop: number }> {
  const st = botState();
  if (st.running) return { drop: st.drop };
  st.running = true;
  const emit = (phase: string, done: number, note?: string) =>
    ix.emit({ type: "bots", drop: st.drop, phase, done, total: BOT_COUNT, note });
  try {
    const d = await createDrop({ startsIn: 12, payWindow: BOT_WINDOW, pieces: 2 });
    st.drop = d.id;
    emit("funding", 0);
    const bots = Array.from({ length: BOT_COUNT }, () => privateKeyToAccount(generatePrivateKey()));
    const tipper = privateKeyToAccount(generatePrivateKey());
    let funded = 0;
    await Promise.all([
      ...bots.map((b) => op.fund(b.address, BOT_GAS, BOT_TINR).then(() => emit("funding", ++funded))),
      op.fund(tipper.address, TIPPER_GAS, BOT_TINR),
    ]);
    const wait = d.startsAt * 1000 - Date.now() + 400;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const baseFee = BigInt(ix.head.baseFee);
    const maxFee = (baseFee * 5n) / 4n + 1_000_000_000n;
    const signed = await Promise.all(
      planBots().map(({ bot, piece }) =>
        buildClaim(bots[bot], { dropId: d.id, piece, deposit: "50", nonce: 0, permitNonce: 0 }, { maxFee }),
      ),
    );
    emit("claiming", 0);
    let sent = 0;
    for (let i = 0; i < signed.length; i += 25) {
      const wave = signed.slice(i, i + 25);
      await Promise.all(
        wave.map(async (s) => {
          try {
            const h = await op.relay.send(s.raw);
            ix.sendTimes.set(h.toLowerCase(), Date.now());
          } catch (e) {
            console.error("bot claim send", errText(e).slice(0, 120));
          }
          emit("claiming", ++sent);
        }),
      );
      await new Promise((r) => setTimeout(r, 250));
    }
    // the over-cap tip: simulate (reason) then send for real so the refusal is on chain
    const over = await buildClaim(
      tipper,
      { dropId: d.id, piece: 0, deposit: "50", nonce: 0, permitNonce: 0 },
      { tip: OVER_TIP, maxFee: (baseFee * 5n) / 4n + OVER_TIP },
    );
    let reason = "tip above cap";
    try {
      await publicClient().call({ account: tipper.address, to: over.params.to, data: over.params.data, gas: over.params.gas, maxPriorityFeePerGas: OVER_TIP, maxFeePerGas: over.params.maxFeePerGas });
    } catch (e) {
      reason = /tip above cap/.test(errText(e)) ? "tip above cap" : errText(e).slice(0, 80);
    }
    try {
      const h = (await op.relay.send(over.raw)) as Hex;
      const r = await publicClient().waitForTransactionReceipt({ hash: h, pollingInterval: 250, timeout: 20_000 });
      if (r.status === "reverted") {
        ix.noteTipRefused(d.id);
        emit("rolling", sent, `100 gwei tip refused: ${reason} · ${h}`);
      }
    } catch (e) {
      emit("rolling", sent, `over-cap tip: ${errText(e).slice(0, 80)}`);
    }
    return { drop: d.id };
  } finally {
    st.running = false;
  }
}
