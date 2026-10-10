# Build state - dibs
Updated: 2026-10-10 06:50 IST | mode: hackathon | channel: relay | phase: 0-intake (BEFORE the clock)
(Keep this under 60 lines. Overwrite it at every phase boundary and before stopping.)

## Now
- Phase / current task: planning done; nothing built; nothing committed. Window opens 09:00 IST (provisional).
- Last good commit: none (no repo yet)            Last good deploy: none

## What worked (with evidence IDs)
- Plan check: 0 errors, 1 warning (provisional clock), 16 tasks, briefs T01–T16.

## What failed (memory IDs) - do not retry without a new root cause
- none yet. Anticipated: F-0001 (Monad 10 MON reserve: small wallets can't spend native value).

## Not tried yet / open questions
- Real build-block instants (re-set the clock at kickoff with --confirmed).
- Monad Foundation "Judging Process Criteria" page text (JS-only; read it in a browser).
- Faucet amount; ≥ 30 test MON in the operator wallet.
- Indian thrift drops still on comment/DM claims? (15-minute check, A-5).

## Changes that need care (migrations applied, deploys, destructive ops)
- Contracts deploy to Monad testnet (T03): addresses are config; redeploy is safe.

## Key paths
- Contract interface + tx rules: ARCHITECTURE.md · UI: ../hackathon-idea/monad-blitz-pune-v3/ui/UI-SPEC.md · paste lines: PROMPTS.md

## Exact next step
At kickoff: `python3 .prod-build/pb.py --root . clock set --start <announced> --end <announced> --freeze <end-1h> --confirmed`, fork + clone, copy this folder in, first commit, then `python3 .prod-build/pb.py task T01 start` and paste T01.
