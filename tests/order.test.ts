import { describe, expect, it } from "vitest";
import { recoverMessageAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { checkOrder, orderMessage } from "@/lib/order";

const buyer = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const o = { drop: 4, piece: 0, name: "@quiet.fox", contact: "", address: "12 MG Road, Pune 411001", ts: 1_000_000 };

describe("delivery details", () => {
  it("are signed by the buyer's wallet and recover to it", async () => {
    const sig = await buyer.signMessage({ message: orderMessage(o) });
    expect((await recoverMessageAddress({ message: orderMessage(o), signature: sig })).toLowerCase()).toBe(buyer.address.toLowerCase());
    // changing the address breaks the signature: nobody can redirect a parcel
    const other = await recoverMessageAddress({ message: orderMessage({ ...o, address: "somewhere else" }), signature: sig });
    expect(other.toLowerCase()).not.toBe(buyer.address.toLowerCase());
  });

  it("need a name and an address, within limits, and a fresh timestamp", () => {
    expect(checkOrder(o, 1_000_500)).toBeNull();
    expect(checkOrder({ ...o, name: " " }, 1_000_500)).toMatch(/name/);
    expect(checkOrder({ ...o, address: "" }, 1_000_500)).toMatch(/address/);
    expect(checkOrder({ ...o, address: "x".repeat(301) }, 1_000_500)).toMatch(/too long/);
    expect(checkOrder(o, 1_000_000 + 11 * 60_000)).toMatch(/expired/);
  });
});
