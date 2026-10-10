// Move test MON between wallets we control, and see what is parked vs spendable.
//   node scripts/mon.mjs status [address ...]
//   node scripts/mon.mjs send --to 0x… --amount 0.5 [--env .env] [--key OPERATOR_PK] [--below-reserve]
// The key is read from the env file and never printed. Monad keeps a 10 MON reserve per wallet: a transfer that
// leaves the sender under 10 MON reverts unless that wallet has been idle for a few blocks (--below-reserve tries it).
// If a live server is using the same key, prefer POST /api/admin/mon: sending from outside makes the server's
// next transaction fail once before it re-reads its nonce.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, fallback, formatEther, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPCS = ["https://testnet-rpc.monad.xyz", "https://rpc.ankr.com/monad_testnet", "https://rpc-testnet.monadinfra.com"];
const chain = { id: 10143, name: "Monad Testnet", nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: RPCS } } };
const transport = fallback(RPCS.map((u) => http(u, { timeout: 10_000 })));
const pub = createPublicClient({ chain, transport });
const RESERVE = parseEther("10");
const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const envOf = (file) =>
  Object.fromEntries(readFileSync(file, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const line = async (label, address) => {
  const bal = await pub.getBalance({ address });
  const spend = bal > RESERVE ? bal - RESERVE : 0n;
  console.log(`${label.padEnd(18)} ${address}  ${formatEther(bal).padStart(22)} MON  spendable above reserve: ${formatEther(spend)}`);
  return bal;
};

if (args[0] === "status") {
  const env = envOf(flag("env", ".env"));
  const pk = env[flag("key", "OPERATOR_PK")];
  if (pk) await line("this wallet", privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`).address);
  for (const a of args.slice(1).filter((x) => /^0x[0-9a-fA-F]{40}$/.test(x))) await line("peer", a);
} else if (args[0] === "send") {
  const env = envOf(flag("env", ".env"));
  const pk = env[flag("key", "OPERATOR_PK")];
  const to = flag("to");
  const amount = flag("amount");
  if (!pk || !to || !amount) {
    console.error("usage: send --to 0x… --amount <MON> [--env file] [--key NAME] [--below-reserve]");
    process.exit(1);
  }
  const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
  const value = parseEther(amount);
  const before = await line("from", account.address);
  await line("to", to);
  const block = await pub.getBlock();
  const maxFeePerGas = (block.baseFeePerGas ?? 100_000_000_000n) * 2n + 1_000_000_000n;
  const left = before - value - 21_000n * maxFeePerGas;
  if (left < 0n) {
    console.error("FAIL not enough MON");
    process.exit(1);
  }
  if (left < RESERVE && !args.includes("--below-reserve")) {
    console.error(`FAIL this would leave the sender at ${formatEther(left)} MON, under the 10 MON reserve. Add --below-reserve to try (the wallet must be idle).`);
    process.exit(1);
  }
  const wallet = createWalletClient({ chain, transport, account });
  const hash = await wallet.sendTransaction({ to, value, gas: 21_000n, maxPriorityFeePerGas: 1_000_000_000n, maxFeePerGas });
  const r = await pub.waitForTransactionReceipt({ hash, pollingInterval: 300 });
  console.log(`tx ${hash} ${r.status}`);
  await line("from (after)", account.address);
  await line("to (after)", to);
  if (r.status !== "success") process.exit(1);
} else {
  console.log("usage: node scripts/mon.mjs status [address ...] | send --to 0x… --amount <MON> [--env file] [--key NAME] [--below-reserve]");
}
