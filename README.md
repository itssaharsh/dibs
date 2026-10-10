# Dibs

**Dibs: a claim link for Instagram thrift drops. Buyers tap at once, Monad records the order, and a no-show's deposit pays the seller as the item rolls to #2.**

Built at Monad Blitz Pune V3 on Monad testnet (chain id 10143). Test money only: the rupee token (tINR) is a test token.

Planning (idea, UI spec, contract, architecture and task plan) was written before the build block; every line of code and the first commit came after it opened.

Forked from [monad-developers/monad-blitz-pune](https://github.com/monad-developers/monad-blitz-pune) as the event asks; the three template commits are the organisers'. Every commit by our team is after the build block opened.

## Stack

Versions checked with `npm view <pkg> version license` on 2026-10-10 (each repository URL matches the real project):

| Package | Version | License | Repository |
|---|---|---|---|
| next | 16.4.0 | MIT | github.com/vercel/next.js |
| viem | 2.57.4 | MIT | github.com/wevm/viem |
| vitest | 5.0.3 | MIT | github.com/vitest-dev/vitest |
| motion | 14.1.0 | MIT | github.com/motiondivision/motion |
| qrcode.react | 4.2.0 | ISC | github.com/zpao/qrcode.react |

Contracts: Foundry 1.8.5 (solc 0.8.37, EVM prague), OpenZeppelin Contracts 5.7.0 vendored in `contracts/lib`.

## Run it

```bash
cp .env.example .env          # fill OPERATOR_PK etc.
npm install
node scripts/check-rpc.mjs    # chain id 10143, latest block, operator balance (> 10 MON)
npm run dev
cd contracts && forge build
```
