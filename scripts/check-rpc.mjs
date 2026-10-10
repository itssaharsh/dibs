// Proves the chain and the operator wallet work: chain id, latest block, operator MON balance.
// Usage: node scripts/check-rpc.mjs   (reads .env if present; never prints the key)
import { existsSync } from "node:fs";
import { createPublicClient, fallback, formatEther, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const CHAIN_ID = 10143;
const RESERVE = parseEther("10");
const DEFAULT_RPC_HTTP = [
  "https://testnet-rpc.monad.xyz",
  "https://rpc.ankr.com/monad_testnet",
  "https://rpc-testnet.monadinfra.com",
];

if (existsSync(".env")) process.loadEnvFile(".env");

const fail = (msg) => {
  console.error(`FAIL ${msg}`);
  process.exit(1);
};

const urls = (process.env.MONAD_RPC_HTTP ?? "")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);
const rpcs = urls.length ? urls : DEFAULT_RPC_HTTP;

const client = createPublicClient({
  transport: fallback(rpcs.map((url) => http(url, { timeout: 10_000, retryCount: 1 }))),
});

const chainId = await client.getChainId().catch((e) => fail(`RPC unreachable: ${e.shortMessage ?? e.message}`));
console.log(`chainId ${chainId}`);
if (chainId !== CHAIN_ID) fail(`expected chain id ${CHAIN_ID}, got ${chainId}`);

const block = await client.getBlockNumber();
console.log(`latest block ${block}`);

const pk = process.env.OPERATOR_PK?.trim();
if (!pk) fail("OPERATOR_PK is not set (put it in .env)");
let operator;
try {
  operator = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`).address;
} catch {
  fail("OPERATOR_PK is not a valid private key");
}

const balance = await client.getBalance({ address: operator });
console.log(`operator ${operator} balance ${formatEther(balance)} MON`);
if (balance <= RESERVE) fail("operator below the 10 MON reserve");
console.log("OK");
