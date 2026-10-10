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
const BOT_GAS = parseEther("0.06");
const TIPPER_GAS = parseEther("0.1");
const BOT_TINR = parseEther("200"); // covers a doubled deposit when the same bots come back
const OVER_TIP = 100_000_000_000n; // 100 gwei, 50× the cap

/** Pure plan: which piece each bot claims (exported for the dry-run test). */
export function planBots(n = BOT_COUNT, pieces = 2) {
  return Array.from({ length: n }, (_, i) => ({ bot: i, piece: i % pieces }));
}

type BotState = { running: boolean; drop: number; keys: Hex[]; rounds: number };
const g = globalThis as unknown as { __dibsBots?: BotState };

export function botState() {
  return (g.__dibsBots ??= { running: false, drop: 0, keys: [], rounds: 0 });
}

export async function runBotRound(ix: Indexer, op: Operator, count = BOT_COUNT): Promise<{ drop: number }> {
  const st = botState();
  if (st.running) return { drop: st.drop };
  st.running = true;
  const emit = (phase: string, done: number, note?: string) =>
    ix.emit({ type: "bots", drop: st.drop, phase, done, total: count, note });
  try {
    const d = await createDrop({ startsIn: 12, payWindow: BOT_WINDOW, pieces: 2 });
    st.drop = d.id;
    emit("funding", 0);
    // the same wallets come back each round, so their record (ghosted last time) prices this round's deposit
    while (st.keys.length < count) st.keys.push(generatePrivateKey());
    const bots = st.keys.slice(0, count).map((k) => privateKeyToAccount(k));
    st.rounds++;
    const tipper = privateKeyToAccount(generatePrivateKey());
    let funded = 0;
    await Promise.all([
      ...bots.map((b) => op.fund(b.address, BOT_GAS, BOT_TINR).then(() => emit("funding", ++funded))),
      op.fund(tipper.address, TIPPER_GAS, BOT_TINR),
    ]);
    // wait for CHAIN time (block timestamps can trail the server clock by a second or more)
    while (ix.chainNow() < d.startsAt + 0.5) await new Promise((r) => setTimeout(r, 100));
    const baseFee = BigInt(ix.head.baseFee);
    const maxFee = (baseFee * 5n) / 4n + 1_000_000_000n;
    // returning bots have sent transactions before: read each one's nonce (10 at a time, under RPC limits)
    const nonces: number[] = [];
    for (let i = 0; i < bots.length; i += 10) {
      const chunk = await Promise.all(
        bots.slice(i, i + 10).map((b) => publicClient().getTransactionCount({ address: b.address, blockTag: "pending" }).catch(() => 0)),
      );
      nonces.push(...chunk);
    }
    const signed = await Promise.all(
      planBots(count).map(({ bot, piece }) =>
        // the permit nonce only matters the first time: the allowance it grants is unlimited and stays
        buildClaim(bots[bot], { dropId: d.id, piece, deposit: "50", nonce: nonces[bot], permitNonce: 0 }, { maxFee }),
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
