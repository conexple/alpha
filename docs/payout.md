# Payout timing

> Cleaned-up English version of the canonical Thai spec (prep folder
> `docs/03-payout-timing-v3.md`).

## TL;DR

1. **Two independent rules** must pass for a commission to actually pay
   out: (Rule 1) the recipient is active at the cycle cut-off, and
   (Rule 2) the commission's 30-day hold has elapsed.
2. **Hold anchors at purchase time**, not at cycle boundary.
3. **Settlement happens at cycle cut-off** (daily 23:00 UTC for the
   demo network); each cycle settles all commissions whose hold has
   elapsed since the last cycle.
4. **Single source of truth.** `conexple_network` owns all Position
   state. Other programs change it via CPI only.

## Rule 1 — active at payout

A recipient must be `Active` at the moment the cycle scheduler
considers their pending commissions. "Active" means:

- `Position.status == Active`
- The Position's most recent extending purchase is within 2 cycles

If a recipient is `Expired` at cut-off, the commission redirects to
the social pool.

## Rule 2 — 30-day hold (purchase-anchored)

Each commission has `anchor_at = purchase_time` and `settle_at =
anchor_at + cycle_length_seconds`. Before `settle_at`, the
merchant can **void** the purchase, refunding the buyer and cancelling
the commission. At or after `settle_at`, the commission is "settled"
(refund-proof) and waits for the next cycle cut-off.

| Cycle | Hold duration |
|---|---|
| Daily | 24 h |
| Weekly | 7 d |
| Monthly | 30 d |
| Quarterly | 90 d |
| Yearly | 365 d |

## Why the two rules are separate

- **Rule 2 protects the merchant** from buying a refund and losing
  the commission too.
- **Rule 1 protects the protocol** from dormant accounts collecting
  passive income.

Merging them would force a tradeoff between these two unrelated
concerns. Keeping them separate keeps the contract auditable.

## Timeline example

```
Setup: Cycle = monthly (30-day hold). B buys on 2026-01-29 10:00 UTC.

────────────────────────────────────────────────
EARN (January)
  29 Jan 10:00  B buys 1,000 → margin 50% = 500 → split ÷ 7 ≈ 71.43
                accrue Pending(level1=E, 71.43)
                accrue Pending(level3=A, 71.43)
                accrue Pending(social_pool, 285.72)  ← inactive levels fall here
                Rule-1 check is deferred to settlement; we accrue regardless.
────────────────────────────────────────────────
HOLD (30 days)
  29 Jan → 28 Feb  refund window.
                    - B returns the product → cancel pending; nothing pays.
                    - B does not return → status flips to Settled at 28 Feb 10:00.
────────────────────────────────────────────────
WAIT FOR CYCLE CUT-OFF
  28 Feb 10:00     Pending → Settled (refund-proof). Now waiting.
  28 Mar 23:00 UTC cycle cut-off — scheduler does Rule-1 check and pays.

  At 28 Mar 23:00:
    - E.status == Active → 71.43 lands in E's USDC ATA.
    - A.status == Active → 71.43 lands in A's USDC ATA.
    - social_pool        → 285.72 lands in pool ATA.
────────────────────────────────────────────────
A and E see the deposit by ~early April.
```

## Position lifecycle

```
  ┌─────────┐
  │ Active  │ ← purchase = extend (last_purchase_round bumps)
  └────┬────┘
       │ cumulative_earned ≥ earnings_cap
       ↓
  ┌──────────────────┐
  │ Active(locked)   │ ← purchases stop extending, but commission still
  │                  │   accrues to descendants (cap protects you, not them)
  └────┬─────────────┘
       │ 2 cycles since last extending purchase
       ↓
  ┌─────────┐
  │ Expired │ → children get re-placed; wallet goes to bottom of network
  └─────────┘
```

## Dispute handling

### Pre-settle (within hold)

Merchant calls `conexple_escrow::void_purchase`, which:
- Verifies the merchant authority
- Verifies the pending is still `Pending`
- Verifies `now < settle_at`
- Marks the pending `Voided`

The on-chain trail keeps the original purchase record visible for
audit; only the pending payout is cancelled.

### Post-settle

Once a payout has hit the recipient's USDC ATA, on-chain action
stops. Any further dispute is between merchant and customer
off-chain. The protocol provides:

- `force_expire(wallet)` — operator or merchant can mark a
  position expired (use case: customer gaming the system, repeated
  voids)
- Auto-threshold: ≥ 3 voids in 3 consecutive rounds → automatic
  `force_expire` (V1: V1 logic in operator backend; V2: enforced on
  chain)

## Activity rule per merchant

V1 hardcodes "any purchase > 0 = active." V2 will let merchants
choose:

- `ANY` — any non-zero purchase (loyalty programs)
- `THRESHOLD` — sum ≥ amount (e-commerce)
- `SUBSCRIPTION` — exact amount (SaaS, insurance)

V1 hardcodes `ANY` to keep the demo simple.

## Edge cases

| Scenario | Outcome |
|---|---|
| Recipient is Active during the earn round, Expired at cut-off | Social pool |
| Recipient was Inactive during earn, Active at cut-off | Pays (Rule 1 only checks at cut-off) |
| Position hits cap mid-cycle | Locks; descendants still pay; expires after 2 dormant cycles |
| Merchant voids exactly at `settle_at` | Rejected. The cutoff is `now < settle_at` (strict) |
| Operator changes hold duration | Effective from the next cycle, not retroactive |

## See also

- [`mechanics.md`](./mechanics.md) — network shape, commission split, expiry
- [`architecture.md`](./architecture.md) — on-chain ↔ off-chain wiring
