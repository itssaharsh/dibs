# Dibs

**Dibs: a 'BOOK' comment with a deposit behind it. Ghost a seller and it pays them; pay on time and your deposit shrinks at every Dibs store.**

![The Dibs board live on Railway: three buyers called dibs on one jacket and each put down a deposit priced by their own record — 25 (paid on time before), 50 (new buyer), 100 (ghosted before) — with the block each call landed in](docs/board.png)

| | |
|---|---|
| **Live URL** | https://web-production-b1eb0.up.railway.app — board: [/board/latest](https://web-production-b1eb0.up.railway.app/board/latest) · phone: [/d/latest](https://web-production-b1eb0.up.railway.app/d/latest) |
| **Repo** | https://github.com/itssaharsh/dibs |
| **Deployment network** | Monad Testnet (chain id 10143), hosted on Railway |
| **Contract address** | DropHouse [`0xb6517ec3d3b676f0ed2e278ef9955fba98352a75`](https://testnet.monadvision.com/address/0xb6517ec3d3b676f0ed2e278ef9955fba98352a75) · tINR [`0x9266e65380e7f1bd5fc64a9a4f4fb9f1a6acf27c`](https://testnet.monadvision.com/address/0x9266e65380e7f1bd5fc64a9a4f4fb9f1a6acf27c) · Funder [`0x3f3f1e5fb18c95736f089776352d15e9bc4149f4`](https://testnet.monadvision.com/address/0x3f3f1e5fb18c95736f089776352d15e9bc4149f4) — all three verified (source published) |
| **Demo video** | [docs/demo.mp4](docs/demo.mp4) (65 s, the live site: one buyer pays, one ghosts, the next drop prices them 25 / 100) · ad: [docs/ad.mp4](docs/ad.mp4) |

> Every outcome goes on the buyer's record — paid on time, or ghosted. The contract keeps it from its own outcomes, every Dibs store reads it, and no store can edit it. So reliable buyers put down less, ghosts put down more, and a fresh wallet only ever gets the stranger price.

## Judge it in 90 seconds

1. Open the board: `/board/latest`. Open the drop on your phone (scan the QR, or `/d/latest`). A wallet is made for you, with test money. No sign-in.
2. Tap **Dibs**. Your call lands with its block number, on your phone and on the board. New buyers put down 50 tINR.
3. If you get first dibs, don't pay. When the timer hits zero your 50 goes to the seller and the next caller is up.
4. Presenter: **Start drop**. On the new drop your phone asks for a **100** deposit (you ghosted once). A buyer who paid on time is asked for **25**. The board shows each caller's deposit and record.
5. Presenter: **Run bot round**. 100 scripted wallets call dibs and ghost: every deposit pays the seller, every one of those wallets now pays double at any Dibs store, and one claim with a 100 gwei tip is refused on chain ("tip above cap").

## What's real, what's simulated

| | |
|---|---|
| Calls of dibs, payments, ghost forfeits, withdrawals | **Live on Monad testnet** (chain 10143), one transaction each, signed on the phone |
| Buyer record (paid on time / ghosted) and the deposit it prices | **Live on chain**: `paidCount` / `ghostCount` / `depositFor` in DropHouse |
| Order of the line | **Chain order**: block, then position in block. Every row links to MonadVision |
| Money | **tINR, a test token** the app mints. No real rupees |
| Store | A labelled demo store ("pocket.thrift"); piece pictures are illustrations |
| Bot round | **Synthetic**: 100 generated wallets, labelled "Bot round — synthetic" on screen |
| Instagram | Not integrated. The link is what a seller would put in a story |
| Contract v1 | [0x119d…302f](https://testnet.monadvision.com/address/0x119d4dd7b665717d328dc059daa98b85e7c8302f) (uniform deposits) is superseded by v2 (record-priced deposits) |

## How it works

- **The record.** `DropHouse.sol` ([verified on MonadVision](https://testnet.monadvision.com/address/0xb6517ec3d3b676f0ed2e278ef9955fba98352a75)) counts, per wallet, payments made in time and windows that lapsed. `depositFor()` prices every new call from that record: standing = paid − ghosted; 0 (a stranger) puts down the drop's deposit, +1 half, +2 a quarter, −1 double, −2 triple. Nobody reports a ghost: the contract records its own outcomes, so no seller can smear a buyer, and starting a fresh wallet only buys the stranger price.
- **The drop.** DropHouse also keeps one list of calls per piece. `claimWithPermit` takes a refundable deposit in one transaction and appends the buyer. The first in line holds the piece for the pay window. `payWithPermit` buys it (the deposit counts toward the price). After the window anyone can call `advance()`: the deposit goes to the seller and the next claimant's turn starts. Once a piece sells, everyone else `withdraw`s their deposit.
- **Tip cap.** Monad leaders order transactions by priority fee, so `claim` reverts with `"tip above cap"` when `tx.gasprice - block.basefee > 2 gwei`. A fee can't buy a place.
- **Money moves in tINR** ([ERC-20 + permit](https://testnet.monadvision.com/address/0x9266e65380e7f1bd5fc64a9a4f4fb9f1a6acf27c)), never native MON. Monad keeps a 10 MON reserve per account, so small wallets can't send value. **`Funder.sol`** ([verified](https://testnet.monadvision.com/address/0x3f3f1e5fb18c95736f089776352d15e9bc4149f4)) gives up to 50 phones gas MON and tINR in one transaction.
- **One Next.js server** (Railway) holds a WebSocket to Monad (`newHeads` + `logs`). It pushes the line to every screen over SSE, with a polling fallback for proxies that buffer, so phones never poll the chain. It also funds new wallets, relays the phones' signed transactions across three public RPCs, and runs the keeper that calls `advance()` when a window ends. After a restart it rebuilds state from contract views.
- **Chain time.** Monad block timestamps trail wall clocks by about a second. Drop start, countdowns and the keeper all use the last block's timestamp, not the device clock. Without this, early claims revert with "not started".

Measured on testnet today: 100 bot claims landed across 10 blocks in 2.9 s. The median from relay to the claim being seen on the stream was 0.4 s. A phone shows its place about 1.4 s after the tap.

## Run it

You need Node 22+ and, for the contracts, [Foundry](https://getfoundry.sh). The repo already points at the deployed
contracts (`deployments/testnet.json`), so you don't have to deploy anything to run it.

- **Just look:** `npm install && npm run dev` with no keys at all. The board and phone pages run against the live
  contracts; only "fund a new phone" and the presenter buttons are off.
- **Everything:** make a throwaway key (`cast wallet new`), send it more than 10 test MON from
  https://faucet.monad.xyz (Monad keeps 10 MON parked per wallet; see [docs/MON.md](docs/MON.md)), and put it in `.env`.

```bash
cp .env.example .env            # OPERATOR_PK (test key holding > 10 test MON), DEPLOYER_PK, PRESENTER_KEY (any string)
npm install
node scripts/check-rpc.mjs      # chain 10143, latest block, operator balance
npm run dev                     # http://localhost:3000 — board at /board/latest#key=<PRESENTER_KEY>, phone at /d/latest
npm test && npm run typecheck   # unit tests (reducer, guards, keeper, tx params, reconnect)
cd contracts && forge test      # 8 tests: order by block, tip cap, forfeit, pay+withdraw, guards, permit
```

Deploy: Railway, one instance, `npm run build` / `npm start`, with the variables from `.env.example` (`railway.json` is included).
Contracts: `forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz --broadcast` from `contracts/`. Addresses are in `deployments/testnet.json`.

## Honest limits

- It doesn't stop a scalper who is willing to pay. It prices people who don't mean to pay, and it stops fee-bidding.
- A record tied to a wallet is only as strong as the wallet: a ghost can start fresh, but only at the stranger price. A real product would bind the wallet to a phone passkey.
- The record is public, per wallet, under a nickname. That is the point for sellers; buyers see exactly what sellers see, on their own record page.
- Real money would need a rupee on-ramp. Everything here is testnet money.
- Another fast chain could run this. Monad's ~0.4 s blocks are what make it work live, in a room.
- Next: bind the wallet to a phone passkey so a record can't be shed, and let each seller choose how steeply the record prices deposits.

## Built at Monad Blitz Pune V3

Planning (idea, UI spec, contract, architecture and task plan) was written before the build block; every line of code and the first commit came after it opened.

Forked from [monad-developers/monad-blitz-pune](https://github.com/monad-developers/monad-blitz-pune) as the event asks; the three template commits are the organisers'. Every commit by our team is after the build block opened.

**AI tools used:** Claude Code (Claude Opus) wrote and tested the code from the team's plan, deployed the contracts and ran the live checks. The decisions and the pitch are the team's.

### Stack

Versions checked with `npm view <pkg> version license` on 2026-10-10 (each repository URL matches the real project):

| Package | Version | License | Why |
|---|---|---|---|
| next | 16.4.0 | MIT | pages, API, SSE and the indexer in one process |
| viem | 2.57.4 | MIT | burner wallets sign on the phone; server reads/sends |
| qrcode.react | 4.2.0 | ISC | the board's join QR |
| vitest | 5.0.3 | MIT | unit tests |
| @playwright/test | 1.64.0 | Apache-2.0 | headless phones for the live checks (`scripts/burst.mjs`) |

Contracts: Foundry 1.8.5 (solc 0.8.37, EVM prague), OpenZeppelin Contracts 5.7.0 (vendored in `contracts/lib`). LED digits: DSEG7 Classic (OFL-1.1, `public/fonts`).
