# Implementation contract - dibs
mode: hackathon | channel: relay | created: 2026-10-10
Upstream read: idea package (Dibs, Monad Blitz Pune V3) and UI-SPEC.md (prod-ui, Sprint scope). Both are planning notes kept beside the repository.

## 1. Intent
- User and moment of use: a small Instagram thrift seller at drop time, selling one-of-a-kind pieces, and the followers racing to claim them on their phones.
- What they can do: buyers tap Dibs to join a piece's line (a refundable deposit), see their place within about a second, pay when it is their turn, or withdraw the deposit if someone else bought it; the seller creates the drop and watches holders, timers and money.
- What changes (before -> after): before, the seller messages the first "BOOK" commenter, waits hours, and rolls the piece to the next person by hand; a no-show costs the claimer nothing. After, the chain sets the order, #1 has a fixed pay window, and a no-show's deposit goes to the seller as the piece rolls to #2 automatically.

## 2. Scope
MUST:
- DropHouse contract: create drop, claim (with permit) taking a deposit, tip cap, one claim per wallet per piece, pay window, pay, advance (forfeit to seller, next holder), withdraw; events for every state change.
- TestRupee (tINR) ERC-20 with permit; Funder contract that funds burner wallets with gas MON and mints tINR in one transaction.
- Server (one Next.js process): chain indexer singleton (WebSocket logs + backfill), SSE stream, wallet funding, raw-tx send relay across RPCs, keeper that calls advance(), presenter admin routes (start, bot round), stats.
- Buyer page /d/[drop] with every state in UI-SPEC; board /board/[drop]; seller page /seller/[drop]; landing /.
- Bot round (100 scripted wallets that claim and abandon; one over-the-cap tip that is refused).
- Deployed on a stable URL, opened signed out.
SHOULD: claim ticket page /d/[drop]/ticket; holder chime; replay of a recorded real run on the landing; OG image.
COULD: buyer reputation (bigger deposit for repeat no-shows); Instagram integration; rupee on-ramp; multiple sellers.
WON'T now: databases, queues, Redis, account systems, mainnet, real money, a token, an indexer service.

## 3. Core journeys
J1 Claim: buyer opens the link -> wallet created and funded -> taps Dibs at drop time -> claim tx included -> buyer and board show the place in line with its block number.
J2 Roll: holder's pay window ends without payment -> keeper calls advance() -> deposit moves to the seller, the next claimant becomes holder -> board tears the stub, chimes, seller balance rises; buyers' phones update.
J3 Pay or withdraw: holder pays within the window -> piece sold, everyone else's "Withdraw" appears -> withdraw returns deposits.

## 4. Surfaces
UI-SPEC IDs: S0 `/` · S1 `/d/[drop]` · S2 `/board/[drop]` · S3 `/seller/[drop]` · `/d/[drop]/ticket`. API: `GET /api/stream`, `POST /api/wallet`, `POST /api/send`, `POST /api/admin/{start,bots,create}`, `GET /api/health`.

## 5. States per journey
| Journey | initial | loading | success | error | empty | partial | retry | disabled | permission-denied | offline/degraded |
|---|---|---|---|---|---|---|---|---|---|---|
| J1 Claim | pre-drop countdown, button says when it opens | wallet setup "Setting up…"; claiming "Getting in line…" | "You're #4 · block N" | claim failed: reason shown, no deposit taken | line empty: "Be first in line" | claim sent, not yet seen by stream > 3 s: "Still landing…" | same signed tx re-sent up to 3 times | sold out / already in line, with reason | n/a: no accounts; admin routes need the presenter key | stream lost: last state greyed + "Reconnecting to Monad…"; RPC down: send relay tries the next RPC |
| J2 Roll | holder with countdown | keeper tx pending (no UI change until the event) | stub torn, next holder, balance +deposit | keeper tx failed: retried next tick; board shows countdown at 0:00 "rolling…" | queue exhausted: piece unsold, "No one left in line" | — | keeper retries every 1 s | n/a | n/a | stream lost as J1 |
| J3 Pay/withdraw | "PAY 400 tINR · 0:52" | "Paying…" / "Withdrawing…" | "It's yours" / "Deposit back" | window passed during pay: "Too late — the piece moved on"; deposit already forfeited | — | — | resend same signed tx | pay disabled for non-holders with reason | n/a | as J1 |

## 6. Data
| Entity | Key fields | Relationships | Owner | Persistence | Source of truth | PII/retention |
|---|---|---|---|---|---|---|
| Drop | id, seller, token, startsAt, payWindow, price, deposit, pieceCount | has pieces | seller address | contract storage | chain | none |
| Piece | dropId, index, queue[], head, deadline, sold, buyer | belongs to drop; queue of claims | contract | contract storage | chain | none |
| Claim | buyer, blockNumber, index | in a piece's queue | buyer address | contract storage + events | chain | burner addresses only; nicknames derived from the address |
| Piece metadata | name, size, photo, price label | maps to piece index | seller | `seed/drop.json` in the repo | repo file | none |
| Server cache | drop state, events with receivedAt, stats | rebuilt from logs at boot | server | memory only | chain wins on any conflict | none |
| Burner key | private key | one per browser | the buyer's browser | localStorage | browser | test-only keys; never sent to the server |

## 7. Interfaces
| Interface | Purpose | Contract file | Failure mode | Fallback |
|---|---|---|---|---|
| Monad testnet RPC (HTTP) | send raw txs, reads, backfill | `lib/chain.ts` | rate limit (429) / timeout | rotate across QuickNode, Ankr, Monad Foundation RPCs; retry the same signed tx |
| Monad testnet RPC (WebSocket) | logs + new heads for the indexer | `lib/indexer.ts` | socket drop | reconnect with backoff; backfill with getLogs from the last seen block |
| SSE `/api/stream` | push state to phones and board | `lib/stream-types.ts` | client disconnect | client auto-reconnects; server sends a fresh snapshot |
| Operator key (server) | funding, keeper, admin txs | `lib/operator.ts` | nonce clash / low MON | single queue with local nonce tracking; low-balance alarm in `/api/health` |
| Faucet / Blitz Portal | test MON for the operator | manual | daily limits | pooled from teammates before the start |

## 8. Constraints
- Chain: Monad testnet, chain id 10143. Facts read on 2026-10-10 from docs.monad.xyz: "300ms block frequency", "600ms finality"; gas is charged on the gas limit (minimum base fee 100 MON-gwei, so 0.01 MON per 100k gas limit); reserve balance 10 MON per EOA (value-spending txs that leave an account below it revert); "Leaders in the default Monad client use a priority gas auction (PGA) to order transactions"; no global mempool; no blob transactions.
- Therefore: money moves only in tINR (ERC-20) so burners never spend native value; every tx sets an explicit `gas` and `maxPriorityFeePerGas` ≤ the contract's tip cap; the operator wallet keeps > 10 MON at all times.
- Public RPC limits (testnet docs): QuickNode 50 rps (eth_call 25 rps), Ankr 300 per 10 s, Monad Foundation 20 rps (no batch). Phones never poll the chain.
- Abuse limits: `/api/wallet` funds an address once (in-memory set) and at most 120 addresses per drop; `/api/send` accepts only transactions to DropHouse or TestRupee, ≤ 5 per address per 10 s, body ≤ 4 KB; admin routes require the presenter key.
- Security: no secrets in client bundles (only `NEXT_PUBLIC_*` addresses and chain id); operator and deployer keys in env only; test keys only, funded with test MON only.
- Deadline and freeze: see §12. Sponsor: Monad ("Build any consumer app on Monad").
- Judging (verbatim from the event page, read 2026-10-10): "Peer-Judged: Your fellow builders choose the winners." No rubric or weights published.
- Performance: tap -> "Getting in line…" ≤ 100 ms; tap -> place in line shown ≤ 2 s at the venue (measured and shown); board renders 60 claims without dropping frames on the presenter laptop.

## 9. Acceptance criteria
AC-1: WHEN two wallets claim the same piece THE SYSTEM SHALL order them by block number, then position in block, and the board SHALL show that order with each block number. Verify: `forge test --match-test test_orderByBlock`; observe: board shows block numbers. Priority: must
AC-2: IF a claim's priority fee exceeds the cap THEN THE SYSTEM SHALL revert with "tip above cap". Verify: `forge test --match-test test_tipCap` (RED first). Priority: must
AC-3: IF the holder does not pay before the deadline THEN advance() SHALL send the deposit to the seller and start the next claimant's window. Verify: `forge test --match-test test_advanceForfeits` (RED first). Priority: must
AC-4: WHEN the holder pays in time THE SYSTEM SHALL mark the piece sold and let every other claimant withdraw their deposit. Verify: `forge test --match-test test_payAndWithdraw`. Priority: must
AC-5: IF a wallet claims the same piece twice, or after it sold, or before startsAt THEN THE SYSTEM SHALL revert with a named reason and take no deposit. Verify: `forge test --match-test test_claimGuards`. Priority: must
AC-6: WHEN a buyer opens /d/1 with no input THE SYSTEM SHALL show the demo store's drop with the Dibs action on the first screen at 390×844 and the rule line. Verify: foldcheck (prod-ui) on the deployed URL; `npm run test:e2e -- buyer.spec`. Priority: must
AC-7: WHEN a claim is included THE SYSTEM SHALL show the buyer their place within 2 s of the tap on venue Wi-Fi. Verify: observe: 5 taps timed on a phone at the venue. Priority: must
AC-8: WHEN the presenter starts the bot round THE SYSTEM SHALL fund 100 wallets, land their claims, forfeit every abandoned claim to the seller, and refuse one over-cap tip, all visible on the board. Verify: observe: bot round on testnet; `npm run bots -- --dry` unit. Priority: must
AC-9: IF the SSE stream drops THEN THE SYSTEM SHALL grey the last state, show "Reconnecting to Monad…", and recover a fresh snapshot within 5 s of the server returning. Verify: `npm test -- stream-reconnect`. Priority: must
AC-10: WHEN /api/wallet is called twice for one address THE SYSTEM SHALL fund it once. Verify: `npm test -- wallet-once`. Priority: must
AC-11: WHEN the board opens with no input THE SYSTEM SHALL lead with the demo thrift store's drop, the join QR and the live Monad block number (the promise: "Instagram thrift drops"). Verify: foldcheck on /board/1 at 1440×900. Priority: must

## 10. Assumptions
A-1 [blocking, answered]: real money? -> No. tINR test token on Monad testnet; labelled on every screen.
A-2 [reversible]: the room's phones can reach the deployed URL over venue Wi-Fi or mobile data -> validate in the first hour with a 50-tx burst; fallback: hotspot + recorded take.
A-3 [reversible]: the team can gather ≥ 25 test MON for the operator -> validate before the start (faucet + Blitz Portal + teammates).
A-4 [safe]: one drop (id 1) with three pieces is enough for the demo.
A-5 [reversible]: Indian thrift drops still take claims by comment or DM -> validate before the start: ten live accounts (from the idea package). If false, re-aim the opening line at overselling unique pieces.

## 11. Demo script
0:00 board live, block counter ticking; sourced opening line, "N of us, one jacket — scan" · 0:15 phones "Ready" · 0:25 Start (T0 in 5 s) · 0:30 the room taps; stubs land with block numbers · 0:50 #1 (teammate) ignores the prompt; window ends; stub tears; chime; NOW HOLDING 02; seller +50 · 1:20 bot round: 100 wallets claim and abandon; forfeits stream to the seller; one over-cap tip refused · 1:50 stats strip + one stub opened on MonadVision · 2:15 close: does not stop a scalper who pays; test money; another fast chain could run it.
Staged failure: the no-show (J2) and the refused over-cap tip (AC-2).

## 12. Event and judged path
(This file is committed with the repository, so a judge may read it. Quote the event's own public pages, with the date each was read. Nothing about individual judges and no guesses about what they like.)
- Window: start 2026-10-10T03:30Z (09:00 IST) · freeze 2026-10-10T11:30Z (17:00 IST, our choice) · end 2026-10-10T15:30Z (21:00 IST). Source: https://luma.com/monad-blitz-pune-sep-2026, registered view, "Saturday, October 10 · 9:00 AM - 9:00 PM", read 2026-10-10; the page says "Build: 7 hours of high-speed execution." The 7-hour block's own start and end are not published: provisional until kickoff, when the clock is re-set to the announced instants. Rule on earlier work: none stated on the event page or in the city repository's README (read 2026-10-10); treated as forbidden — the repository and its first commit start after the build block opens.
- How an entry is judged: a live pitch to the room ("Demo your MVP to the crowd."), then a vote by the builders ("Peer-Judged: Your fellow builders choose the winners."). Submission: a fork of the city repository with "your project name, a one-liner description", then the Blitz Portal, which says it is where you "submit projects, and vote for your favorites" (blitz.devnads.com, read 2026-10-10). Pitch length and voting details: not published.
- Criteria: not published. We plan against five assumed lines: technical execution, usefulness to a consumer, originality, design and presentation, use of Monad.
- Criteria coverage: technical execution — met (stats panel; over-cap tip refused) · usefulness — partial (no real seller has used it; whether buyers accept a deposit is untested) · originality — partial (first-come claims on a chain have existed since 2021 NFT drops; our forfeit-and-rollover and tip cap are the new part) · design — met (every voter uses the claim page) · use of Monad — met (block numbers on every place in line; the measured span).
- Capability coverage: the prize text names no capabilities; the event's stated want is "Monad is built for speed, and Blitz is how we prove it" -> the room's same-second claims ordered in 0.3 s blocks, shown live with block numbers.
- Main result: on the projector, the room's own names fill the jacket's line in block order within about a second; then #1's window ends and the jacket moves to #2 while the seller's balance rises by the deposit. Material: the room's own phones and taps, plus a labelled 100-wallet bot round. Staged failure: the no-show, and an over-cap tip that is refused.
- Promise coverage: "Instagram thrift drops" -> the first screen is a labelled demo thrift store's drop of three one-of-a-kind pieces, opened from a link meant for a story · "Dibs" -> the one big button · "a no-show's deposit pays the seller" -> the seller balance on the board rises on every forfeit.
- Before the clock: the idea research, UI spec, mockups, this contract, the architecture and the plan were written before the build block, with test-MON and account checks; no code, repository or commit existed before it. README sentence: "Planning (idea, UI spec, contract, architecture and task plan) was written before the build block; every line of code and the first commit came after it opened."
