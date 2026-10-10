---
id: ADR-0002
type: decision
title: Burner wallets submit their own claims; no relayer re-signing
status: active
scope: project
components: client, contracts
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

Context: the product's promise is that the chain, not our server, orders claims. Decision: each phone holds a burner key and signs its own tx; the server only forwards raw signed txs. Alternatives rejected: meta-tx relayer (the server would choose the order). Consequences: burners need gas MON from the Funder. Revisit when: a paymaster is available on the target network.