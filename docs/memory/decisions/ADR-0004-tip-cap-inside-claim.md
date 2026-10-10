---
id: ADR-0004
type: decision
title: Tip cap inside claim()
status: active
scope: project
components: contracts
triggers: 
evidence: ARCHITECTURE.md#Key decisions
verified_at: 2026-10-10@nogit
relates: 
supersedes: 
helpful: 0
harmful: 0
cite_hash: 7d2d00dc513dae41
created: 2026-10-10
source: unknown
---

Context: Monad docs: leaders order transactions by priority gas auction, so a higher fee buys a place. Decision: require(tx.gasprice - block.basefee <= 2 gwei). Alternatives rejected: batch auction / raffle (changes the product), no cap (the pitch line would be false). Consequences: the client must set maxPriorityFeePerGas <= 2 gwei. Revisit when: Monad changes block ordering.