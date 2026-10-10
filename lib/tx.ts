// Builds and signs every buyer transaction locally (burner key never leaves the browser).
// Explicit gas (measured on Monad; gas is charged on the limit) and a tip at or under DropHouse.MAX_TIP.
import { encodeFunctionData, keccak256, maxUint256, parseSignature, type Hex, type LocalAccount } from "viem";
import DropHouseAbi from "@/lib/abi/DropHouse.json";
import { addresses, GAS, maxFeeFor, monadTestnet, TIP } from "@/lib/chain";

export const MAX_TIP = 2_000_000_000n; // mirrors DropHouse.MAX_TIP
const abi = DropHouseAbi as typeof DropHouseAbi;

export type Fees = { baseFee?: bigint; tip?: bigint; maxFee?: bigint };

export function feeParams(f: Fees = {}) {
  const maxPriorityFeePerGas = f.tip ?? TIP;
  return { maxPriorityFeePerGas, maxFeePerGas: f.maxFee ?? maxFeeFor(f.baseFee) + (maxPriorityFeePerGas > TIP ? maxPriorityFeePerGas : 0n) };
}

export async function signPermit(account: LocalAccount, value: bigint, nonce: number, deadline: bigint) {
  const sig = await account.signTypedData!({
    domain: { name: "Test Rupee", version: "1", chainId: monadTestnet.id, verifyingContract: addresses.token },
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Permit",
    message: { owner: account.address, spender: addresses.dropHouse, value, nonce: BigInt(nonce), deadline },
  });
  const { v, r, s } = parseSignature(sig);
  return { v: Number(v), r, s };
}

export type TxParams = { to: Hex; data: Hex; gas: bigint; nonce: number; maxPriorityFeePerGas: bigint; maxFeePerGas: bigint };

async function sign(account: LocalAccount, p: TxParams) {
  const raw = await account.signTransaction!({ chainId: monadTestnet.id, type: "eip1559", value: 0n, ...p });
  return { raw, hash: keccak256(raw), params: p };
}

const permitDeadline = () => BigInt(Math.floor(Date.now() / 1000) + 600);

export async function claimTxParams(
  account: LocalAccount,
  a: { dropId: number; piece: number; deposit: string; nonce: number; permitNonce: number },
  fees: Fees = {},
): Promise<TxParams> {
  const deadline = permitDeadline();
  // one allowance for DropHouse (test money): the deposit is priced on chain by the buyer's record
  const { v, r, s } = await signPermit(account, maxUint256, a.permitNonce, deadline);
  const data = encodeFunctionData({ abi, functionName: "claimWithPermit", args: [BigInt(a.dropId), a.piece, deadline, v, r, s] });
  return { to: addresses.dropHouse, data, gas: GAS.claimWithPermit, nonce: a.nonce, ...feeParams(fees) };
}

export async function buildClaim(...args: Parameters<typeof claimTxParams>) {
  return sign(args[0], await claimTxParams(...args));
}

export async function buildPay(
  account: LocalAccount,
  a: { dropId: number; piece: number; price: string; deposit: string; nonce: number; permitNonce: number },
  fees: Fees = {},
) {
  const deadline = permitDeadline();
  const { v, r, s } = await signPermit(account, maxUint256, a.permitNonce, deadline);
  const data = encodeFunctionData({ abi, functionName: "payWithPermit", args: [BigInt(a.dropId), a.piece, deadline, v, r, s] });
  return sign(account, { to: addresses.dropHouse, data, gas: GAS.payWithPermit, nonce: a.nonce, ...feeParams(fees) });
}

export async function buildWithdraw(account: LocalAccount, a: { dropId: number; piece: number; nonce: number }, fees: Fees = {}) {
  const data = encodeFunctionData({ abi, functionName: "withdraw", args: [BigInt(a.dropId), a.piece] });
  return sign(account, { to: addresses.dropHouse, data, gas: GAS.withdraw, nonce: a.nonce, ...feeParams(fees) });
}
