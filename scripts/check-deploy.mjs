// Reads drop 1 (or the id given) from the deployed DropHouse and prints it.
// Usage: node scripts/check-deploy.mjs [dropId]
import { readFileSync } from "node:fs";
import { createPublicClient, fallback, formatEther, http } from "viem";

const dep = JSON.parse(readFileSync("deployments/testnet.json", "utf8"));
const abi = JSON.parse(readFileSync("lib/abi/DropHouse.json", "utf8"));
const client = createPublicClient({
  transport: fallback(["https://testnet-rpc.monad.xyz", "https://rpc.ankr.com/monad_testnet"].map((u) => http(u))),
});
const id = BigInt(process.argv[2] ?? 1);
const [seller, token, startsAt, payWindow, price, deposit, pieces] = await client.readContract({
  address: dep.dropHouse, abi, functionName: "drops", args: [id],
});
if (seller === "0x0000000000000000000000000000000000000000") {
  console.error(`FAIL drop ${id} not found on ${dep.dropHouse}`);
  process.exit(1);
}
console.log(`dropHouse ${dep.dropHouse} (chain ${dep.chainId}, deploy block ${dep.deployBlock})`);
console.log(`drop ${id}: seller ${seller} token ${token}`);
console.log(`pieces ${pieces} · price ${formatEther(price)} · deposit ${formatEther(deposit)} · pay window ${payWindow}s · starts ${new Date(Number(startsAt) * 1000).toISOString()}`);
for (let i = 0; i < pieces; i++) {
  const len = await client.readContract({ address: dep.dropHouse, abi, functionName: "queueLength", args: [id, i] });
  console.log(`  piece ${i}: ${len} in line`);
}
