import { describe, expect, it } from "vitest";
import { parseTransaction } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { addresses, GAS } from "@/lib/chain";
import { buildClaim, buildPay, buildWithdraw, MAX_TIP } from "@/lib/tx";
import { planBots } from "@/lib/bots";

const acct = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");

describe("tx-params", () => {
  it("claims carry the measured gas limit and a tip under the cap", async () => {
    const c = await buildClaim(acct, { dropId: 1, piece: 0, deposit: "50", nonce: 3, permitNonce: 1 });
    const tx = parseTransaction(c.raw);
    expect(tx.to?.toLowerCase()).toBe(addresses.dropHouse.toLowerCase());
    expect(tx.gas).toBe(GAS.claimWithPermit);
    expect(tx.maxPriorityFeePerGas! <= MAX_TIP).toBe(true);
    expect(tx.nonce).toBe(3);
    expect(tx.chainId).toBe(10143);
    expect(tx.value ?? 0n).toBe(0n);
  });

  it("pay and withdraw also set explicit gas", async () => {
    const p = parseTransaction((await buildPay(acct, { dropId: 1, piece: 0, price: "450", deposit: "50", nonce: 4, permitNonce: 2 })).raw);
    const w = parseTransaction((await buildWithdraw(acct, { dropId: 1, piece: 0, nonce: 5 })).raw);
    expect(p.gas).toBe(GAS.payWithPermit);
    expect(w.gas).toBe(GAS.withdraw);
    expect(w.maxPriorityFeePerGas! <= MAX_TIP).toBe(true);
  });

  it("bot round dry run: 100 bots split over two pieces", () => {
    const plan = planBots();
    expect(plan).toHaveLength(100);
    expect(plan.filter((b) => b.piece === 0)).toHaveLength(50);
  });
});
