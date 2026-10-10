# Build state - dibs
Updated: 2026-10-10 14:52 IST | mode: hackathon | phase: BUILT and DEPLOYED on Railway

## Now
- Built: contracts (deployed + verified), server (WS indexer, SSE + polling fallback, wallet funding, relay, keeper, admin, bot round), buyer/board/seller/landing/ticket pages, e2e.
- Live: https://web-production-b1eb0.up.railway.app (Railway project 'dibs', service 'web', one instance; redeploy with `railway up --service web --ci`). The laptop server and tunnel are stopped: only ONE process may hold OPERATOR_PK.
- Fork: github.com/itssaharsh/dibs (main pushed, description = one-liner).
- Backup take: ~/dibs-takes/backup-1.mp4 (63.8 s).

## Addresses (Monad testnet 10143)
DropHouse 0x119d4dd7b665717d328dc059daa98b85e7c8302f · tINR 0x9266e65380e7f1bd5fc64a9a4f4fb9f1a6acf27c · Funder 0x3f3f1e5fb18c95736f089776352d15e9bc4149f4 · deploy block 69775604 · operator 0xB99CE2Cc7E3fDaf405fa4f807642B39A3590d7B1

## What worked (evidence)
E0018-21 forge 8/8 · E0022-23 deploy+verify · E0024-29 server tests · E0030 5 live phones · E0031 100-bot round · E0032 pay/withdraw · E0033 e2e 14/14 · E0034 backup take

## What failed (do not repeat)
- viem watchBlocks over WS on Monad → onBlock(undefined): use raw eth_subscribe.
- eth_getLogs capped at 100 blocks: rebuild from contract views at boot.
- Block timestamps trail wall clock ≥1 s: use chain time for start/deadlines/keeper/bots.
- Cloudflare quick tunnel buffers SSE: polling fallback (/api/poll) kicks in after 4 s.

## Exact next step
1. At the venue: `SP=/tmp node scripts/burst.mjs <url> 10`; real photos into public/pieces/; final take (T15); Blitz Portal submission (T16).
