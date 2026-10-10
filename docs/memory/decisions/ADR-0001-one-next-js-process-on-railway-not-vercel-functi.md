---
id: ADR-0001
type: decision
title: One Next.js process on Railway, not Vercel functions
status: active
scope: project
components: server, deploy
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

Context: the indexer, keeper and operator nonce queue need one long-lived process; serverless would open one RPC socket per viewer and lose the singletons. Decision: one Next.js Node process on Railway, single instance. Alternatives rejected: Vercel functions (no long-lived socket, per-request cold state); separate API service (two deployables). Consequences: in-memory state rebuilt from logs at boot. Revisit when: more than one instance is needed.