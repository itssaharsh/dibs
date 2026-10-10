# Test MON: what is parked, what is spent, and how to recycle it

Monad keeps a **10 MON reserve per wallet**: a transfer of native MON that leaves the sender under 10 MON reverts.
So 10 MON in the operator wallet is **parked, not spent**. It only has to be there when that wallet sends MON.
Dibs no longer uses a fixed 12 MON floor: every funding batch is cut to what keeps the operator above the reserve.

`GET /api/health` shows it: `operator.mon`, `operator.spendable` (what sits above the reserve) and `operator.phonesAffordable`.

## What is actually used up

| Item | Cost | Comes back? |
|---|---|---|
| A new phone | 0.15 MON gift + about 0.02 gas | No: the key is in that person's browser |
| A bot in a round | about 0.08 MON (0.05 gift, its share of the funding batch, the forfeit the keeper sends) | About 0.01 with a sweep |
| The same bot in the next round | about 0.065 MON (topped up by its shortfall only) | — |
| The over-cap tipper, per round | 0.1 MON gift | About 0.02 with a sweep |

A bot round is sized to what the operator can spend above the reserve, keeping 1.5 MON back for phones. If you ask for
100 and the wallet affords 24, you get 24 and the board says so.

## Recycling

All three go through the server's own nonce queue, so a live server never trips over a transaction sent from outside.
They need the presenter key (`x-presenter-key`).

```bash
U=https://web-production-b1eb0.up.railway.app; K=<PRESENTER_KEY>

# 1. Sweep every bot wallet's leftover gas back to the operator (do it when you're done with bot rounds)
curl -X POST $U/api/admin/recycle -H "x-presenter-key: $K"

# 2. Move MON to another wallet we control (listed in the MON_PEERS variable), keeping the reserve
curl -X POST $U/api/admin/mon -H "x-presenter-key: $K" -H 'content-type: application/json' \
  -d '{"to":"0x9A2221e1951D76b0D9Aea2f31659C5f86F3D1A1A","amount":"2"}'

# 3. Park the reserve itself elsewhere for a minute (the operator must be idle; Dibs can't fund phones until it's back)
curl -X POST $U/api/admin/mon -H "x-presenter-key: $K" -H 'content-type: application/json' \
  -d '{"to":"0x9A2221e1951D76b0D9Aea2f31659C5f86F3D1A1A","amount":"12","belowReserve":true}'

# A small gas gift to any address (up to 0.5 MON each, 2 MON per server run), e.g. another app's owner phone
curl -X POST $U/api/admin/mon -H "x-presenter-key: $K" -H 'content-type: application/json' \
  -d '{"to":"0x<address>","amount":"0.5"}'
```

From a laptop, for a wallet whose server is not running (the key is read from the env file and never printed):

```bash
node scripts/mon.mjs status 0x9A2221e1951D76b0D9Aea2f31659C5f86F3D1A1A
node scripts/mon.mjs send --env ../other-app/.env --key SERVER_PK --to 0xB99CE2Cc7E3fDaf405fa4f807642B39A3590d7B1 --amount 1 --below-reserve
```

## Three catches

- **Nonce bump:** sending from a key that a live server also uses makes that server's next transaction fail once before it re-reads its nonce. Use the admin route for the Dibs operator.
- **Idle wallet only:** a transfer that leaves the sender under 10 MON only goes through when that wallet has sent nothing in the last few blocks. The bot sweep relies on this and worked on testnet (8 of 8 wallets).
- **Recycling moves MON; it doesn't make any.** Phone gifts are gone once sent. For a room of 50 phones plus a 100-bot round, the operator needs about 26 MON: 10 parked, about 8 for phones, about 8 for bots.
