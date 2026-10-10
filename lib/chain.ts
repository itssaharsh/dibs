import {
  createPublicClient,
  defineChain,
  fallback,
  http,
  type PublicClient,
} from "viem";
import deployment from "@/deployments/testnet.json";

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

type Hex = `0x${string}`;

/** Deployed addresses (public). NEXT_PUBLIC_* env overrides deployments/testnet.json. */
export const addresses = {
  dropHouse: (process.env.NEXT_PUBLIC_DROPHOUSE || deployment.dropHouse) as Hex,
  token: (process.env.NEXT_PUBLIC_TOKEN || deployment.token) as Hex,
  funder: (process.env.NEXT_PUBLIC_FUNDER || deployment.funder) as Hex,
  deployBlock: BigInt(process.env.DEPLOY_BLOCK || deployment.deployBlock),
};

/** Gas limits measured with eth_estimateGas on Monad testnet (+~15%); gas is charged on the limit. */
export const GAS = {
  claimWithPermit: 320_000n,
  payWithPermit: 280_000n,
  withdraw: 150_000n,
  advance: 200_000n,
  createDrop: 160_000n,
};
export const TIP = 1_000_000_000n; // 1 gwei, under DropHouse.MAX_TIP (2 gwei)
export const MIN_BASE_FEE = 100_000_000_000n; // 100 gwei
export const maxFeeFor = (baseFee: bigint = MIN_BASE_FEE) =>
  (baseFee > MIN_BASE_FEE ? baseFee : MIN_BASE_FEE) * 2n + TIP;

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
