# Operator guide (V1 stub)

> An operator is anyone deploying a Conexple network — not just
> Conexple itself. The protocol is open; the operator competes on
> merchant relationships, UX, and policy.
>
> This V1 doc is intentionally short. Post-hackathon, it expands into
> a full runbook.

## Roles

| Role | Holds | Responsibility |
|---|---|---|
| **Admin** | the deployer keypair | initialize_rules, register_oracle, force_expire (per-merchant), upgrade |
| **Oracle** | a separate signing keypair (lives in Cloudflare Secret) | place_member, record_purchase, settle_pending CPIs |
| **Merchant** | a per-merchant signing keypair | deposit USDC, void_purchase within hold |
| **Consumer** | their own Phantom/Solflare keypair | register_member, record purchases (signed by merchant), receive payouts |

## V1 deploy steps

See `../submission/HANDOFF.md`. The short version:

1. `solana-keygen new` for deployer + oracle
2. `anchor deploy --provider.cluster devnet`
3. `pnpm exec tsx scripts/init-network.ts`
4. `pnpm exec tsx scripts/mint-demo-usdc.ts`
5. `pnpm exec tsx scripts/seed-demo.ts`
6. `wrangler secret put ORACLE_SECRET` (base58 of oracle keypair)
7. `wrangler deploy` (operator backend)
8. `wrangler pages deploy apps/web/.next`

## Source of truth

- **On-chain `Position`, `MerchantEscrow`, `PoolAccount`** — authoritative
- **D1 mirror in operator backend** — derived, eventually-consistent
- **Frontend** — read-through cache via the operator's `/rpc` proxy

## Replacing an oracle

If the oracle key leaks or you want to rotate:

1. Generate a new keypair locally
2. `conexple_oracle::register_oracle(<new_pubkey>)` (admin signed)
3. `wrangler secret put ORACLE_SECRET <new_base58>`
4. Wait for in-flight transactions to finish
5. `conexple_oracle::revoke_oracle(<old_pubkey>)` (admin signed)
6. Audit `oracle_audit` table for unexpected signatures from the old key

## When to fork

If you disagree with how Conexple Thailand operates the canonical
network (split percentages, infinity criteria, hold duration, etc.),
fork the repo, deploy your own instance with different parameters,
and make the case to merchants and consumers in your market. The
protocol is Apache 2.0 specifically to allow this.

## What's missing (post-hackathon)

- A real merchant onboarding flow (currently scripted)
- Per-merchant activity rules (`ANY` / `THRESHOLD` / `SUBSCRIPTION`)
- Reporting + accounting exports (CSV / Parquet from D1 to R2)
- Operator console for adjusting cycle parameters
- Dispute escalation (tiered: merchant → operator → DAO)
- Network registry for cross-network discovery (V2)
