# Dibs — prompts for the coding agent (relay pack)

Mode: hackathon · 3 milestones, 16 tasks · M1 delivers: a phone claims on Monad testnet and the deployed board shows its place with the block number.
Planning files in this folder are **uncommitted until the build block opens**. The idea package and UI spec live beside this folder in `../hackathon-idea/` and never go into the repo.

## 0. At kickoff (before the first paste line)

1. Read the announced "hacking begins" and "code freeze / submission" times. Then, in this folder:
   `python3 .prod-build/pb.py --root . clock set --start <hacking-begins, e.g. 2026-10-10T11:00:00+05:30> --end <submission deadline> --freeze <deadline minus 1 h> --source "kickoff announcement, <time read>" --confirmed --tz=+05:30`
   and update the Window line in `.prod-build/contract.md` §12 with what was announced.
2. Only after `python3 .prod-build/pb.py clock` says the phase is BUILDING: fork `monad-developers/monad-blitz-pune` (or the repo the organisers name) from `main` with project name **dibs** and description = the one-liner (below), clone it, and copy this folder's contents into the clone root (keep `../hackathon-idea/` outside it). Check `.gitignore` lists `hackathon-idea/` and `.env`.
3. `cp .env.example .env` once T01 creates it, and fill keys from ACCESS.md. Never paste keys into chat.
4. First commit (after the start): `git add .prod-build AGENTS.md CLAUDE.md ARCHITECTURE.md PROMPTS.md docs .gitignore && git commit -m "plan: contract, architecture, task plan (written before the build block)"`.
5. Expect `pb.py window` to list the fork's template commits (made by monad-developers before the event, README only) as predating the start. That is the event's required starting point, not your code: say so in the README ("Forked from monad-developers/monad-blitz-pune as the event asks; every commit by our team is after <start time>") and confirm all of your own commits are inside the window. Never re-date a commit.

One-liner (fork description, portal, README first line, ≤180 chars):
> Dibs: a claim link for Instagram thrift drops. Buyers tap at once, Monad records the order, and a no-show's deposit pays the seller as the item rolls to #2.

## 1. Paste lines, in order

Each line is the whole prompt; the brief file carries the context. Before each, run `python3 .prod-build/pb.py task <ID> start` (records BASE). After the agent reports, run `python3 .prod-build/pb.py intake <ID>`; if it passes, `python3 .prod-build/pb.py task <ID> done`.

```
Read AGENTS.md, then .prod-build/briefs/T01.md and do exactly that task.
Run checks through `python3 .prod-build/pb.py` as the brief says.
Finish by writing .prod-build/reports/T01.md in the format at the end of the brief, commit (don't push), and reply with the report.
```
Repeat with T02 … T16 (same three lines, task id changed). Order and dependencies:

| Milestone | Task | What | Target time from start (7 h block) |
|---|---|---|---|
| M1 | T01 | scaffold + one real RPC call + operator balance | 0:00–0:25 |
| M1 | T02 | contracts + tests (tip cap and forfeit RED first) | 0:25–1:15 |
| M1 | T03 | deploy + verify + drop 1 + photos | 1:15–1:35 |
| M1 | T04 | server: indexer, SSE, wallet, send relay, health | 1:35–2:30 |
| M1 | T05 | golden path UI (UI prompts U1+U2) | 2:30–3:05 |
| M1 | T06 | first deploy (Railway) + smoke | 3:05–3:20 |
| M1 | T07 | backup take | 3:20–3:25 |
| M2 | T08 | keeper, admin routes, bot round | 3:25–4:05 |
| M2 | T09 | board to the mockup (U3) | 4:05–4:45 |
| M2 | T10 | buyer states, pay, withdraw (U4) | 4:45–5:25 |
| M2 | T11 | seller page, landing, responsive (U5) | 5:25–5:45 |
| M2 | T12 | motion + chime (U6) | 5:45–6:00 |
| M2 | T13 | release gates (U7) | in the freeze if late |
| M3 | T14 | venue burst + 3 demo runs | freeze |
| M3 | T15 | final take | freeze |
| M3 | T16 | submit (fork, README, portal, `pb.py submit check`) | ≥ 1 h before the deadline |

**Two people?** Person A: T02 → T03 → T08 (contracts and keeper). Person B, in parallel from 0:25: T01's app shell + U1 tokens, then T04 against a local `anvil` chain (`anvil --chain-id 10143`) until T03's addresses land. Merge one at a time; run the full suite on the merged tree. A third person: photos, seed copy, pitch rehearsal, the 15-minute thrift check, and test-MON gathering.

## 2. Scope ladder (cut from the bottom when behind)

Must survive in this order: contracts + tests → deploy → server stream + wallet + send → buyer claim/in-line/your-turn/pay/no-show → board with LED panel and rows → keeper → bot round → seller balance on board → stats strip.
Cut first: T12 motion and chime → landing (open the board directly) → seller page (board shows the seller balance) → ticket page → OG image → withdraw UI (deposits stay claimable; say so).
Never cut: the tip cap, the rule line on the buyer page, block numbers on rows, the honesty labels (test money, demo store, synthetic bots), the backup take.

## 3. Freeze rules (from `pb.py clock` freeze instant)

Only fix, verify, test, docs, deploy, record and submit tasks start (`pb.py task … start` refuses feature work). Record T15 first, then submit T16 with an hour in hand.

## 4. What to paste back to the planner (if you come back to Claude)

`python3 .prod-build/pb.py status` and the last task's report (or `python3 .prod-build/pb.py intake <ID>` output).
