import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_RPC_HTTP, monadTestnet, publicClient, rpcHttpUrls } from "@/lib/chain";

describe("lib/chain", () => {
  const saved = process.env.MONAD_RPC_HTTP;
  afterEach(() => {
    if (saved === undefined) delete process.env.MONAD_RPC_HTTP;
    else process.env.MONAD_RPC_HTTP = saved;
  });

  it("targets Monad testnet 10143 with the three public RPCs and MonadVision", () => {
    expect(monadTestnet.id).toBe(10143);
    expect(monadTestnet.rpcUrls.default.http).toHaveLength(3);
    expect(monadTestnet.blockExplorers?.default.url).toBe("https://testnet.monadvision.com");
  });

  it("reads MONAD_RPC_HTTP as a comma-separated list, else the defaults", () => {
    delete process.env.MONAD_RPC_HTTP;
    expect(rpcHttpUrls()).toEqual(DEFAULT_RPC_HTTP);
    process.env.MONAD_RPC_HTTP = " https://a.example , https://b.example ,";
    expect(rpcHttpUrls()).toEqual(["https://a.example", "https://b.example"]);
  });

  it("returns one shared public client on the Monad chain", () => {
    expect(publicClient()).toBe(publicClient());
    expect(publicClient().chain?.id).toBe(10143);
  });
});
