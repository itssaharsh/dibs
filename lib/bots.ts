// Bot round — synthetic. Up to 100 generated wallets claim the two other pieces at once and never pay;
// one more claims with a 100 gwei tip, which the contract refuses ("tip above cap").
// MON is recycled: the round is sized to what the operator can spend above Monad's 10 MON reserve, returning
// bots are topped up only by their shortfall, and sweepBots() sends every bot's leftover gas back.
import { formatEther, parseEther, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createDrop } from "@/lib/admin";
import { GAS, monadTestnet, publicClient, TIP } from "@/lib/chain";
import type { Indexer } from "@/lib/indexer";
import { errText, spendable, type Operator } from "@/lib/operator";
import { buildClaim } from "@/lib/tx";

export const BOT_COUNT = 100;
export const BOT_WINDOW = 3; // seconds: every abandoned claim rolls fast enough to watch
const BOT_GAS = parseEther("0.05"); // one claim: 380k gas at the bots' max fee (1.25 × base + tip) is 0.048
const KEEP_FOR_PHONES = parseEther("1.5"); // a bot round never spends the MON that funds the next phones
export const MIN_BOTS = 4;
const TIPPER_GAS = parseEther("0.1");
const BOT_TINR = parseEther("200"); // covers a doubled deposit when the same bots come back
const OVER_TIP = 100_000_000_000n; // 100 gwei, 50× the cap

/** Pure plan: which piece each bot claims (exported for the dry-run test). */
export function planBots(n = BOT_COUNT, pieces = 2) {
  return Array.from({ length: n }, (_, i) => ({ bot: i, piece: i % pieces }));
}

type BotState = { running: boolean; drop: number; keys: Hex[]; spare: Hex[]; rounds: number };
const g = globalThis as unknown as { __dibsBots?: BotState };

export function botState() {
  return (g.__dibsBots ??= { running: false, drop: 0, keys: [], spare: [], rounds: 0 });
}

/** What one bot costs the operator: its gas gift, its share of the funding batch, and the forfeit the keeper sends. */
export function botCost(baseFee: bigint): bigint {
  const price = baseFee + TIP;
  return BOT_GAS + 140_000n * price + GAS.advance * price;
}

/** How many bots the operator can afford right now (pure; unit-tested). */
export function sizeRound(balance: bigint, baseFee: bigint, want: number): number {
  const budget = spendable(balance) - KEEP_FOR_PHONES - TIPPER_GAS - GAS.createDrop * (baseFee + TIP);
  if (budget <= 0n) return 0;
  return Math.max(0, Math.min(want, Number(budget / botCost(baseFee))));
}

const inChunks = async <T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> => {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
  return out;
};

/** Send every bot wallet's leftover MON back to the operator (a wallet may empty itself when it has been idle). */
export async function sweepBots(op: Operator, baseFee: bigint): Promise<{ wallets: number; sent: number; mon: string }> {
  const st = botState();
  if (st.running) throw new Error("a bot round is running");
  const keys = [...st.keys, ...st.spare];
  const maxFee = baseFee + 2n * TIP;
  const fee = 21_000n * maxFee;
  let sent = 0;
  let total = 0n;
  await inChunks(keys, 10, async (k) => {
    const a = privateKeyToAccount(k);
    try {
      const [bal, nonce] = await Promise.all([
        publicClient().getBalance({ address: a.address }),
        publicClient().getTransactionCount({ address: a.address, blockTag: "pending" }),
      ]);
      if (bal <= fee + parseEther("0.002")) return;
      const raw = await a.signTransaction({
        chainId: monadTestnet.id, type: "eip1559", to: op.address, value: bal - fee, gas: 21_000n, nonce,
        maxPriorityFeePerGas: TIP, maxFeePerGas: maxFee,
      });
      await op.relay.send(raw);
      sent++;
      total += bal - fee;
    } catch (e) {
      console.error("sweep", errText(e).slice(0, 100));
    }
  });
  return { wallets: keys.length, sent, mon: formatEther(total) };
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
    const tipperKey = generatePrivateKey();
    st.spare.push(tipperKey);
    const tipper = privateKeyToAccount(tipperKey);
    // returning bots still hold gas from last round: top everyone up by the shortfall only
    const balances = await inChunks(bots, 10, (b) => publicClient().getBalance({ address: b.address }).catch(() => 0n));
    const least = balances.reduce((m, x) => (x < m ? x : m), balances[0] ?? 0n);
    const topUp = least >= BOT_GAS ? 0n : BOT_GAS - least;
    let funded = 0;
    const results = await Promise.allSettled([
      ...bots.map((b) => op.fund(b.address, topUp, BOT_TINR).then(() => emit("funding", ++funded))),
      op.fund(tipper.address, TIPPER_GAS, BOT_TINR),
    ]);
    // if the operator ran short mid-way, carry on with the bots that did get funded
    const ready = new Set(bots.filter((_, i) => results[i].status === "fulfilled").map((b) => b.address));
    if (ready.size < Math.min(count, MIN_BOTS)) throw new Error("operator low: bots could not be funded");
    const tipperFunded = results[results.length - 1].status === "fulfilled";
    // wait for CHAIN time (block timestamps can trail the server clock by a second or more)
    while (ix.chainNow() < d.startsAt + 0.5) await new Promise((r) => setTimeout(r, 100));
    const baseFee = BigInt(ix.head.baseFee);
    const maxFee = (baseFee * 5n) / 4n + 1_000_000_000n;
    // returning bots have sent transactions before: read each one's nonce (10 at a time, under RPC limits)
    const nonces = await inChunks(bots, 10, (b) =>
      publicClient().getTransactionCount({ address: b.address, blockTag: "pending" }).catch(() => 0),
    );
    const signed = await Promise.all(
      planBots(count).filter(({ bot }) => ready.has(bots[bot].address)).map(({ bot, piece }) =>
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
    if (!tipperFunded) return { drop: d.id };
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
