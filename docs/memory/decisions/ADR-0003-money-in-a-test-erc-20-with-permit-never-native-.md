---
id: ADR-0003
type: decision
title: Money in a test ERC-20 with permit, never native MON
status: active
scope: project
components: contracts, client
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

Context: Monad's reserve rule (10 MON per EOA) reverts value-spending txs from small wallets; claims must be one tx. Decision: tINR (ERC20Permit), claimWithPermit/payWithPermit. Alternatives rejected: native MON deposits (revert under the reserve), approve+claim (two txs). Consequences: Funder mints tINR. Revisit when: never for this demo.