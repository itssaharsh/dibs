STATUS: DONE
COMMITS: fa4396a..HEAD — v2: shared buyer record prices every deposit; copy re-aimed from "fair queue" to "a BOOK comment with a deposit behind it"
WHY: the user's read was that v1 "screams BookMyShow on blockchain". The planning critic had said the same ("off chain, this is a reservation queue with a no-show fee") and Pune V1 already had two ticketing entries (Monoken, BlitzSeat). The part ticketing doesn't have is the buyer who commits and vanishes; v2 makes that the product.
FILES: contracts/src/DropHouse.sol (paidCount, ghostCount, depositFor, per-claim deposit, Claimed carries deposit, unlimited-allowance permits), contracts/test/DropHouse.t.sol (test_trackRecord), contracts/script/DeployHouse.s.sol, lib/record.ts, lib/abi/DropHouse.json, deployments/testnet.json, lib/{indexer,stream-types,tx,bots,chain,useBurner,fixtures}.ts, app/api/wallet/route.ts, app/d/[drop]/{Buyer.tsx,ticket/Ticket.tsx}, app/board/[drop]/Board.tsx, components/{LineRow,LedPanel,StatsStrip,JudgeCard}.tsx, app/{page,layout}.tsx, README.md, ARCHITECTURE.md, tests/*
EVIDENCE: E0039 forge 9/9 (incl. test_trackRecord: paid → half, ghosted → double, per-claim deposit is what moves); unit 18/18; E0041 e2e 14/14 on Railway; E0040 observed on Railway: A paid, B ghosted → next drop A puts down 25, B 100, a new buyer 50; returning bots 50 → 100. DropHouse v2 0xb6517ec3d3b676f0ed2e278ef9955fba98352a75 verified (Sourcify "perfect"), deploy block 69796067.
RULINGS:
- Standing = paid − ghosted (a later payment redeems a ghost); 0 → base, +1 → ½, ≥+2 → ¼, −1 → 2×, −2 → 3×, ≤−3 → 4×, capped at the price.
- Sybil: a fresh wallet escapes a bad record but only gets the stranger price, so the record that matters is the good one. Said in the README's honest limits.
- No one attests a ghost: the record is written only by the contract's own pay/advance outcomes.
- Permits grant one unlimited tINR allowance to DropHouse (test money) so a record-priced deposit never mismatches a signed amount.
- Bots return across rounds (keys kept in server memory) so the room sees their deposits double.
- v1 DropHouse (0x119d…302f) left deployed; README says it is superseded.
MEMORY: new failure: a phone can show "time ran out" a moment before the chain records the ghost — compute the post-ghost deposit without waiting for the event.
CONCERNS / BLOCKER: problem evidence for Instagram thrift specifically is still a hypothesis (COD refusal data is from a payments vendor); run the 10-account check. Bot keys are lost on a redeploy (first round after a deploy starts fresh).
