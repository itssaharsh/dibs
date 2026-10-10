import { describe, expect, it, vi } from "vitest";
import { FundOnce } from "@/lib/guards";

describe("AC-10 wallet-once", () => {
  it("funds an address once; the second call reports already", async () => {
    const fund = vi.fn(async () => "0xhash");
    const f = new FundOnce(fund);
    const a = f.run("0xAbC0000000000000000000000000000000000001");
    const b = f.run("0xabc0000000000000000000000000000000000001"); // same address, other case
    expect(a.already).toBe(false);
    expect(b.already).toBe(true);
    await expect(a.promise).resolves.toBe("0xhash");
    await expect(b.promise).resolves.toBe("0xhash");
    expect(fund).toHaveBeenCalledTimes(1);
  });

  it("lets a failed funding be retried", async () => {
    let n = 0;
    const f = new FundOnce(async () => {
      if (n++ === 0) throw new Error("rpc down");
      return "ok";
    });
    await expect(f.run("0x1").promise).rejects.toThrow("rpc down");
    const again = f.run("0x1");
    expect(again.already).toBe(false);
    await expect(again.promise).resolves.toBe("ok");
  });
});
