import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { checkRawTx, MAX_BODY, RateLimiter } from "@/lib/guards";

const acct = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const HOUSE = "0x119d4dd7b665717d328dc059daa98b85e7c8302f";
const TOKEN = "0x9266e65380e7f1bd5fc64a9a4f4fb9f1a6acf27c";
const sign = (to: `0x${string}`, chainId = 10143, value = 0n) =>
  acct.signTransaction({ chainId, type: "eip1559", to, value, gas: 100000n, nonce: 0, maxFeePerGas: 201n * 10n ** 9n, maxPriorityFeePerGas: 10n ** 9n, data: "0x" });

describe("send-guard", () => {
  it("relays only DropHouse / tINR transactions on chain 10143", async () => {
    expect(checkRawTx(await sign(HOUSE), [HOUSE, TOKEN]).ok).toBe(true);
    expect(checkRawTx(await sign(TOKEN), [HOUSE, TOKEN]).ok).toBe(true);
    const other = checkRawTx(await sign("0x000000000000000000000000000000000000dEaD"), [HOUSE, TOKEN]);
    expect(other).toMatchObject({ ok: false, status: 400 });
    expect(checkRawTx(await sign(HOUSE, 1), [HOUSE, TOKEN])).toMatchObject({ ok: false, error: "wrong chain" });
    expect(checkRawTx(await sign(HOUSE, 10143, 1n), [HOUSE, TOKEN])).toMatchObject({ ok: false, status: 400 });
    expect(checkRawTx("hello", [HOUSE])).toMatchObject({ ok: false, status: 400 });
  });

  it("allows 5 per sender per 10 s, then 429s", () => {
    const rl = new RateLimiter();
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) expect(rl.allow("0xA", t + i)).toBe(true);
    expect(rl.allow("0xa", t + 6)).toBe(false);
    expect(rl.allow("0xB", t + 6)).toBe(true);
    expect(rl.allow("0xA", t + 10_001)).toBe(true);
  });

  it("caps bodies at 4 KB", () => {
    expect(MAX_BODY).toBe(4096);
  });
});
