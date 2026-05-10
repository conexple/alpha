# apps/operator — Cloudflare Workers backend

Hono router + D1 + KV + Queue + Cron Trigger.
Plays the role of the off-chain operator described in
`docs/05-architecture.md`.

## Routes

| Method · Path | What |
|---|---|
| `GET /health` | service heartbeat (no auth) |
| `POST /placement/decide` | depth-first placement decision under a referrer |
| `POST /webhook/purchase` | HMAC-signed purchase webhook → Queue |
| `POST /settle/run` | manual settlement run (also runs daily on Cron); submits oracle-signed `add_earnings` txs from the Worker. **Note:** devnet free RPCs (api.devnet.solana.com, rpcpool, etc.) reject Cloudflare Workers' IP range with HTTP 403; without a paid Helius/Triton key the Worker can't reach the chain. Use `scripts/settle-onchain.ts` (see below) as a fallback. |
| `GET /settle/pending` | read-only — lists pending rows ready for settlement, with the corresponding buyer + amount joined; used by the local fallback script |
| `POST /settle/record` | record the result of an oracle-signed `add_earnings` tx that was submitted off-Worker (i.e. from the local script). Body: `{purchase_id, signature, recipients:[{wallet, level, amount}]}` |
| `GET /settle/status` | recent settlement runs (id is the on-chain signature when available, `cron-<ts>` otherwise) |
| `POST /oracle/sign` | sign a base64 transaction with the oracle key |
| `POST /oracle/sign-submit` | sign + send + confirm |
| `POST /merchant/void` | void a pending purchase (V1: D1 stub) |
| `POST /merchant/force-expire` | mark a position expired (V1: D1 stub) |
| `POST /rpc` | JSON-RPC proxy with KV cache for `getAccountInfo` etc. |

## Triggers

- `crons = ["0 23 * * *"]` — daily settlement run at 23:00 UTC
- Queue consumer for `conexple-queue-purchase-events` — batched purchase
  ingest

## Local dev

```bash
cd apps/operator
pnpm db:apply:local      # apply Drizzle migrations to local D1 emulator
pnpm dev                 # http://localhost:8787
```

In another terminal:

```bash
curl http://localhost:8787/health
```

## Running a settlement (local fallback)

Because the Cloudflare Workers IP range is blocked from Solana's free
devnet RPCs, the on-chain `add_earnings` submission for the demo runs
from a local script that uses the developer's IP, then reports back to
the Worker. Run it from the repo root:

```bash
OPERATOR_URL=https://conexple-worker-operator.sornwin.workers.dev \
pnpm exec tsx scripts/settle-onchain.ts
```

The script:

1. `GET /settle/pending` for ready rows
2. groups by `purchase_id`, traces the buyer's upline 1..5 hops, builds
   one `add_earnings` ix per active ancestor at `floor(margin/7)`
3. submits one oracle-signed tx per purchase, awaits confirmation
4. `POST /settle/record` with the signature + recipient list so the
   D1 audit + dashboard reflects real on-chain state.

The Solscan-verifiable signatures are stored as `settlements.id` and
the oracle signature lands in `oracle_audit`.

## Deploy

```bash
cd apps/operator

# 1. Apply remote D1 migrations
pnpm db:apply:remote

# 2. Set secrets (one-time)
echo "<base58 oracle keypair>" | wrangler secret put ORACLE_SECRET
echo "https://devnet.helius-rpc.com/?api-key=YOUR_KEY" | wrangler secret put HELIUS_RPC_URL
openssl rand -hex 32 | wrangler secret put PURCHASE_WEBHOOK_HMAC

# 3. Deploy
pnpm deploy
```

The deployed Worker URL is what `apps/web` and the demo storefront
point at via `NEXT_PUBLIC_OPERATOR_URL`.

## Why D1 idempotency instead of Durable Objects (V1)

Durable Objects require the Workers Paid plan ($5/mo). For a 2-day
hackathon demo, judging traffic is small enough that D1 unique
constraints + transactional updates give the ordering guarantees we
need (placement queue, settlement run cycle).

If the operator backend gets serious traffic, switch to:

- `PlacementQueue` Durable Object — atomic per-referrer placement
- `SettlementRound` Durable Object — atomic per-cycle state machine

The schemas and route shapes are designed to make that swap purely
internal — frontend contract doesn't change.

## Drizzle schema

`src/db/schema.ts` — networks, positions (mirror), merchants, purchases,
pending_commission, settlements, oracle_audit, idempotency.

To regenerate migrations after schema edits:

```bash
CF_ACCOUNT_ID=... CF_API_TOKEN=... D1_DATABASE_ID=... pnpm db:generate
```

## Audit

Every oracle signature lands in the `oracle_audit` table with a
timestamp + the calling worker's name. Useful for post-incident
forensics.
