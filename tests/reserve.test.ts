import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { maxFeeFor } from "@/lib/chain";
import { botCost, sizeRound } from "@/lib/bots";
import { affordable, PHONE_GAS, spendable } from "@/lib/operator";

const fee = maxFeeFor(100_000_000_000n);

describe("Monad's 10 MON reserve is parked, not spent", () => {
  it("spendable is what sits above the reserve (plus a small margin)", () => {
    expect(spendable(parseEther("14.8"))).toBe(parseEther("4.75"));
    expect(spendable(parseEther("10.04"))).toBe(0n);
    expect(spendable(parseEther("3"))).toBe(0n);
  });

  it("a wallet just above the reserve can still fund one phone; the old fixed 12 MON floor refused it", () => {
    expect(affordable(parseEther("10.4"), PHONE_GAS, fee, 1)).toBe(1);
    expect(affordable(parseEther("10.1"), PHONE_GAS, fee, 1)).toBe(0);
  });

  it("a batch is cut to what keeps the sender above the reserve instead of reverting whole", () => {
    // 50 phones need 7.5 MON of value: at 12.5 MON the whole batch would leave 5 and revert
    const n = affordable(parseEther("12.5"), PHONE_GAS, fee, 50);
    expect(n).toBeGreaterThan(5);
    expect(n).toBeLessThan(50);
    const worst = BigInt(n) * (PHONE_GAS + 140_000n * fee) + 80_000n * fee;
    expect(parseEther("12.5") - worst >= parseEther("10")).toBe(true);
  });

  it("a bot round is sized to the budget and keeps MON back for phones", () => {
    const base = 100_000_000_000n;
    expect(sizeRound(parseEther("60"), base, 100)).toBe(100);
    const small = sizeRound(parseEther("14.8"), base, 100);
    expect(small).toBeGreaterThan(20);
    expect(small).toBeLessThan(60);
    // what the round costs still leaves the phone buffer above the reserve
    expect(parseEther("14.8") - BigInt(small) * botCost(base) >= parseEther("11.5")).toBe(true);
    expect(sizeRound(parseEther("11"), base, 100)).toBe(0);
  });
});
