# Build state - dibs
Updated: 2026-10-10 16:00 IST | mode: hackathon | phase: v2 (shared buyer record) BUILT and DEPLOYED on Railway

## Now
- Built: contracts (deployed + verified), server (WS indexer, SSE + polling fallback, wallet funding, relay, keeper, admin, bot round), buyer/board/seller/landing/ticket pages, e2e.
- Live: https://web-production-b1eb0.up.railway.app (Railway project 'dibs', service 'web', one instance; redeploy with `railway up --service web --ci`). The laptop server and tunnel are stopped: only ONE process may hold OPERATOR_PK.
- Fork: github.com/itssaharsh/dibs (main pushed, description = one-liner).
- Backup take: ~/dibs-takes/backup-1.mp4 (63.8 s).

## Addresses (Monad testnet 10143)
DropHouse v2 0xb6517ec3d3b676f0ed2e278ef9955fba98352a75 (v1 0x119d…302f superseded) · tINR 0x9266e65380e7f1bd5fc64a9a4f4fb9f1a6acf27c · Funder 0x3f3f1e5fb18c95736f089776352d15e9bc4149f4 · deploy block 69796067 · operator 0xB99CE2Cc7E3fDaf405fa4f807642B39A3590d7B1

## What worked (evidence)
E0018-21 forge 8/8 · E0022-23 deploy+verify · E0024-29 server tests · E0030 5 live phones · E0031 100-bot round · E0032 pay/withdraw · E0033 e2e 14/14 · E0034 backup take

## Re-aim (15:25–16:00 IST)
- v1 read as "BookMyShow on blockchain". v2: every outcome goes on the buyer's record (paidCount / ghostCount in DropHouse); depositFor() prices each call: paid on time halves it, ghosting doubles it, at every drop. One-liner, board, phone, README re-worded (no ticket / queue / token-board language). Evidence E0039–E0041.

## What failed (do not repeat)
- viem watchBlocks over WS on Monad → onBlock(undefined): use raw eth_subscribe.
- eth_getLogs capped at 100 blocks: rebuild from contract views at boot.
- Block timestamps trail wall clock ≥1 s: use chain time for start/deadlines/keeper/bots.
- Cloudflare quick tunnel buffers SSE: polling fallback (/api/poll) kicks in after 4 s.

## Exact next step
1. At the venue: `SP=/tmp node scripts/burst.mjs <url> 10`; real photos into public/pieces/; final take (T15); Blitz Portal submission (T16).
