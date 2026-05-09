# Network mechanics

> Cleaned-up English version of the canonical Thai spec (prep folder
> `docs/02-network-mechanics-v4.md`). Substantively identical;
> phrasing differs to suit a non-Thai-reading judge.

## What goes on-chain

> On-chain: anything that distinguishes this protocol from an MLM scam.

| MLM concern | Conexple structural answer |
|---|---|
| Operator runs with the money | `MerchantEscrow` USDC vault is on-chain |
| Operator changes rules in the dark | `ProtocolConfig` is immutable per network |
| "We paid you X" but didn't | Every `PayoutRecord` is publicly logged |

## Network shape

- **5-level unilevel.** Each Position can have many children (B, C, D
  under A), but commission only flows up at most 5 hops.
- **Depth-first placement.** New members get the first vacant slot
  under their referrer, scanning depth-first.
- **Position vs. Wallet.** A Position is a temporary slot (it expires).
  A Wallet is permanent. Karma loop: when your Position expires, your
  Wallet goes to the bottom of the network and earns its way back up.
- **No genesis node.** Open slots above the highest member just route
  commissions to the social pool.
- **No width expansion.** Every Position has the same width — there's
  no "I bought a fancier slot."

## Commission split — divide by 7

Every purchase produces a commission of `purchase × margin_bps / 10_000`.
The operator chooses `margin_bps` per network, capped at **5000 (50%)**
on-chain. This commission divides into 7 equal slots:

| Slot | Recipient | Rule |
|---|---|---|
| 1 | level-1 upline | Active **and** has at least one purchase this round → recipient. Otherwise → social pool. |
| 2 | level-2 upline | Same |
| 3 | level-3 upline | Same |
| 4 | level-4 upline | Same |
| 5 | level-5 upline | Same |
| 6 | Social pool | Always pool. |
| 7 | Infinity Override | Goes to the **first qualifying upline at depth ≥ 6**. If none qualifies → social pool. |

### Why divide by 7?

The 6th slot funds public goods (the social pool); the 7th rewards
long-term members who have accrued past their first 5 levels via the
Infinity Override. Five flat levels would concentrate too tightly
on the buyer's immediate uplines.

## Activity rule (Rule 1)

A Position only collects commission in a round if it has **its own
purchase ≥ activity_amount** in that round. Otherwise the slot
falls through to the social pool.

This is by design:

- **Protects the protocol** from "dormant accounts harvesting passive
  income forever".
- **Forces engagement** without a recruitment requirement.

## Hold rule (Rule 2)

Each commission anchors at the **purchase time**, not the cycle. The
hold duration equals the cycle length:

| Cycle | Hold |
|---|---|
| Daily | 24 h |
| Weekly | 7 d |
| Monthly | 30 d |
| Quarterly | 90 d |
| Yearly | 365 d |

Within the hold, the merchant can **void** the purchase — refund the
buyer, cancel pending commissions. After hold expiry, commissions
move to the next cycle's settlement run.

## Position expiry

Two triggers:

1. **Ceiling expiry.** Once `cumulative_earned ≥ initial_spend × multiplier`
   (default 10×), the Position locks: it still receives commission
   from purchases by descendants, but the Position's own purchases
   no longer extend its `last_purchase_round`.
2. **Inactivity expiry.** If 2 consecutive cycles pass without the
   Position recording a purchase, it expires. (One round of grace
   is allowed; ≥ 2 = expired.)

When a Position expires:

- Its children scatter — they get re-placed under the next valid
  parent the placement engine picks.
- The wallet goes to the bottom of the network (becomes eligible to
  re-register).

## Margin cap (50%) — why this matters

The protocol enforces `margin_bps_max ≤ 5000` in
`conexple_protocol::initialize_rules`. Above 50%, the product's real
value would be less than half the price — that's the structural
signature of a Ponzi/pyramid where the "purchase" is just a fee to
join. The cap makes it impossible to deploy a fake-product network on
Conexple.

## Settlement cycle minimum (daily) — why

Sub-daily cycles (hourly, minutely) would push on-chain settlement
costs past commission size at the small-purchase scale that's the
whole point of this protocol. We enforce daily-or-slower in
`initialize_rules`.

## Open-protocol framing

Conexple is the **protocol**. Conexple Thailand is the **first
operator**. The protocol is Apache 2.0 — anyone can deploy a network
under their own jurisdiction, with their own merchant relationships,
without paying a license fee. The operator software is in the same
repo; an operator competes on UX and merchant acquisition, not on
controlling the rules.

## What we deliberately did not implement (V1)

- **Width expansion** — out of scope, permanently. See `payout.md`.
- **Auto-assign placement** — illegal in Thailand under direct-selling
  law; structurally absent.
- **Random pool distribution** — would be a gambling-law trigger.
- **Operator self-promotion to oracle** — admin role and oracle role
  are separated.

## See also

- [`payout.md`](./payout.md) — settlement timing, hold mechanism, dispute
- [`architecture.md`](./architecture.md) — how on-chain ↔ off-chain interact
