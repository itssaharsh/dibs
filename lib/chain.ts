import {
  createPublicClient,
  defineChain,
  fallback,
  http,
  type PublicClient,
} from "viem";

// Monad testnet public endpoints (docs.monad.xyz, read 2026-10-10):
// QuickNode 50 rps (eth_call 25 rps) · Ankr 300 per 10 s · Monad Foundation 20 rps, no batch.
export const DEFAULT_RPC_HTTP = [
  "https://testnet-rpc.monad.xyz",
  "https://rpc.ankr.com/monad_testnet",
  "https://rpc-testnet.monadinfra.com",
];
export const DEFAULT_RPC_WS = "wss://testnet-rpc.monad.xyz";
export const EXPLORER_URL = "https://testnet.monadvision.com";

/** HTTP RPCs: MONAD_RPC_HTTP (comma-separated, server only) or the public defaults. */
export function rpcHttpUrls(): string[] {
  const urls = (process.env.MONAD_RPC_HTTP ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  return urls.length ? urls : DEFAULT_RPC_HTTP;
}

export function rpcWsUrl(): string {
  return process.env.MONAD_RPC_WS?.trim() || DEFAULT_RPC_WS;
}

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: DEFAULT_RPC_HTTP, webSocket: [DEFAULT_RPC_WS] },
  },
  blockExplorers: {
    default: { name: "MonadVision", url: EXPLORER_URL },
  },
  testnet: true,
});

export const txUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const addressUrl = (addr: string) => `${EXPLORER_URL}/address/${addr}`;

let client: PublicClient | undefined;

/** One shared read client; rotates across the HTTP RPCs on 429 / timeout. */
export function publicClient(): PublicClient {
  client ??= createPublicClient({
    chain: monadTestnet,
    transport: fallback(
      rpcHttpUrls().map((url) => http(url, { timeout: 10_000, retryCount: 1 })),
    ),
  });
  return client;
}
