---
id: F-0001
type: failure
title: Value transfer from a small Monad wallet reverts (reserve balance)
status: active
scope: global-candidate
components: client, operator
triggers: reverted, reserve, insufficient
evidence: url:https://docs.monad.xyz/developer-essentials/reserve-balance.md
verified_at: 2026-10-10@nogit
relates: 
supersedes: 
helpful: 0
harmful: 0
cite_hash: e3b0c44298fc1c14
created: 2026-10-10
source: unknown
---

Attempted: (anticipated, not yet hit) sending native MON from a wallet holding < 10 MON. Error signature: tx included but reverted, gas paid. Root cause: Monad reserve balance 10 MON per EOA; value-spending txs that leave the account below it revert (one emptying exception per 3 blocks for undelegated EOAs). Fix: move money in an ERC-20; keep the operator > 10 MON + funding. Lesson: When a Monad wallet must spend value, keep it above 10 MON or use a token, because the reserve rule reverts silently. Cheapest early check: read the receipt status of the first funding tx.