import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  http,
  parseEther,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import DropHouseAbi from "@/lib/abi/DropHouse.json";
import FunderAbi from "@/lib/abi/Funder.json";
import TestRupeeAbi from "@/lib/abi/TestRupee.json";
import { addresses, GAS, maxFeeFor, monadTestnet, publicClient, rpcHttpUrls, TIP } from "@/lib/chain";

export const dropHouseAbi = DropHouseAbi as typeof DropHouseAbi;
export const funderAbi = FunderAbi as typeof FunderAbi;
export const tokenAbi = TestRupeeAbi as typeof TestRupeeAbi;

export const RESERVE = parseEther("10");
export const FUND_FLOOR = parseEther("12"); // refuse funding below this (Monad keeps 10 MON reserve per EOA)
export const PHONE_GAS = parseEther("0.25");
export const PHONE_TINR = parseEther("1000");
export const MAX_FUNDED = 400;

type Pending = { addr: Hex; gas: bigint; tinr: bigint; resolve: (hash: Hex) => void; reject: (e: unknown) => void };

/** Raw-tx sender with rotation across RPCs and retry of the same signed bytes. */
export class Relay {
  clients: PublicClient[];
  errors = 0;
  private i = 0;
  constructor(urls = rpcHttpUrls()) {
    this.clients = urls.map((url) =>
      createPublicClient({ chain: monadTestnet, transport: http(url, { timeout: 8_000, retryCount: 0 }) }),
    );
  }
  async send(raw: Hex, tries = 3): Promise<Hex> {
    let last: unknown;
    for (let t = 0; t < tries * this.clients.length && t < 6; t++) {
      const c = this.clients[this.i++ % this.clients.length];
      try {
        return await c.sendRawTransaction({ serializedTransaction: raw });
      } catch (e) {
        const msg = errText(e);
        if (/already known|known transaction|already imported/i.test(msg)) {
          const { keccak256 } = await import("viem");
          return keccak256(raw);
        }
        // a definitive rejection from the node: don't spray it at other RPCs
        if (/nonce too low|insufficient funds|invalid|exceeds|underpriced|reserve/i.test(msg)) throw e;
        this.errors++;
        last = e;
      }
    }
    throw last;
  }
}

export const errText = (e: unknown): string => {
  const x = e as { shortMessage?: string; details?: string; message?: string };
  return [x?.shortMessage, x?.details, x?.message].filter(Boolean).join(" · ") || String(e);
};

/** One operator key, one local nonce, serial signing. Funding batches, keeper and admin txs go through here. */
export class Operator {
  account: PrivateKeyAccount;
  relay = new Relay();
  baseFee = 100_000_000_000n;
  private nonce: number | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private pending: Pending[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  funded = new Set<string>();
  lastBalance = 0n;
  sent = 0;

  constructor(pk: string) {
    this.account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex);
  }

  get address() {
    return this.account.address;
  }

  async balance(): Promise<bigint> {
    this.lastBalance = await publicClient().getBalance({ address: this.address });
    return this.lastBalance;
  }

  /** Serialise: sign with the next nonce and send. Returns the tx hash once the node accepted it. */
  sendTx(tx: { to: Hex; data: Hex; gas: bigint; value?: bigint }): Promise<Hex> {
    const run = async (): Promise<Hex> => {
      if (this.nonce === null) {
        this.nonce = await publicClient().getTransactionCount({ address: this.address, blockTag: "pending" });
      }
      const raw = await this.account.signTransaction({
        chainId: monadTestnet.id,
        type: "eip1559",
        to: tx.to,
        data: tx.data,
        value: tx.value ?? 0n,
        gas: tx.gas,
        nonce: this.nonce,
        maxPriorityFeePerGas: TIP,
        maxFeePerGas: maxFeeFor(this.baseFee),
      });
      try {
        const hash = await this.relay.send(raw);
        this.nonce++;
        this.sent++;
        return hash;
      } catch (e) {
        this.nonce = null; // resync from the chain on the next send
        throw e;
      }
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }

  async call(fn: string, args: unknown[], gas: bigint, to: Hex = addresses.dropHouse, abi: unknown = dropHouseAbi) {
    const data = encodeFunctionData({ abi: abi as typeof dropHouseAbi, functionName: fn as "advance", args: args as [bigint, number] });
    return this.sendTx({ to, data, gas });
  }

  /** Queue an address for the next funding batch (≤ 50 per tx, flushed every second). */
  fund(addr: Hex, gas = PHONE_GAS, tinr = PHONE_TINR): Promise<Hex> {
    this.timer ??= setInterval(() => void this.flush(), 1_000);
    return new Promise((resolve, reject) => this.pending.push({ addr, gas, tinr, resolve, reject }));
  }

  private async flush() {
    if (!this.pending.length) return;
    // one batch per (gas, tinr) pair
    const first = this.pending[0];
    const batch = this.pending.filter((p) => p.gas === first.gas && p.tinr === first.tinr).slice(0, 50);
    this.pending = this.pending.filter((p) => !batch.includes(p));
    try {
      const to = batch.map((b) => b.addr);
      const data = encodeFunctionData({ abi: funderAbi, functionName: "fund", args: [to, first.gas, first.tinr] });
      const hash = await this.sendTx({
        to: addresses.funder,
        data,
        value: first.gas * BigInt(batch.length),
        gas: 80_000n + 140_000n * BigInt(batch.length),
      });
      const r = await publicClient().waitForTransactionReceipt({ hash, pollingInterval: 250, timeout: 30_000 });
      if (r.status !== "success") throw new Error(`funding tx reverted ${hash}`);
      batch.forEach((b) => b.resolve(hash));
    } catch (e) {
      batch.forEach((b) => b.reject(e));
    }
  }
}

const g = globalThis as unknown as { __dibsOperator?: Operator | null };

export function getOperator(): Operator | null {
  if (g.__dibsOperator === undefined) {
    const pk = process.env.OPERATOR_PK?.trim();
    g.__dibsOperator = pk ? new Operator(pk) : null;
  }
  return g.__dibsOperator;
}

export const fmt = (wei: bigint) => formatEther(wei);
