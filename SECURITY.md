# Security Policy

## Status

Conexple is a **hackathon prototype** at v0.1 alpha. Smart contracts are
**unaudited** and deployed only to **Solana devnet**. Do not deploy to
mainnet or use with real funds.

## Reporting a vulnerability

If you find a security issue in the Anchor programs or the operator
backend, **please do not file a public GitHub issue.** Email instead:

- **Contact:** suanwin.paows@gmail.com
- **PGP:** *(add fingerprint after generating an ops PGP key)*

We acknowledge receipt within 72 hours and aim to respond with an
assessment within one week. Reporters who follow this process are
acknowledged in the project changelog (with permission).

## Scope

In scope:
- The four Anchor programs in `programs/` at their published program IDs
- The operator Worker code in `apps/operator/`
- The frontend code in `apps/web/`
- Any deployed Cloudflare endpoint linked from this repo

Out of scope:
- Third-party dependencies (file with the upstream project)
- The demo storefront seed integration (it's fabricated, not a real shop)
- Rate-limit evasion against free-tier RPC quotas
- Theoretical attacks against an audit that does not yet exist

## Disclosure timeline

Because this is a hackathon prototype, a coordinated 90-day window is
not realistic. We aim for:

- Critical (drainable funds, ability to bypass placement rules):
  patch + disclose within 14 days
- High (incorrect commission accrual, ability to expire someone else's
  position): patch + disclose within 30 days
- Medium / low: best effort, typically within the next minor release

## What is not a vulnerability

- Devnet RPC being slow or unavailable
- Phantom wallet refusing to connect on a non-https URL
- Demo seed wallets being publicly known (they are deterministic by design)

## Pre-submission audit (2026-05-11)

A whole-app security pass was run before submission. Findings + fixes:

- **Fixed:** `/oracle/sign` and `/oracle/sign-submit` were exposed to the
  public internet with no auth — anyone could request the operator's
  oracle key sign an arbitrary instruction. These endpoints had no
  internal callers (in-process `loadOracleKeypair` is used instead), so
  both now return HTTP 410 Gone. See `apps/operator/src/workers/oracle.ts`.
- **Fixed:** `/settle/record` accepted unauthenticated POSTs, allowing
  injection of forged settlement audit rows. Now requires HMAC of body
  in `x-conexple-internal` header (same `PURCHASE_WEBHOOK_HMAC` secret
  as `/webhook/purchase`). `scripts/settle-onchain.ts` updated to send
  the header.
- **Known V1 trade-off:** `/settle/run`, `/merchant/void`,
  `/merchant/force-expire` remain unauthenticated so the operator
  dashboard buttons work for hackathon judges. V2 should gate these
  with the same HMAC scheme or move them behind an admin-authority
  worker not exposed to the public web. Code comments in
  `scheduler.ts` + `merchant.ts` flag this.
- **Verified:** No private keys, API keys, or seed phrases ever
  committed; HMAC verification is constant-time; all D1 queries are
  parameterized; frontend bundle contains no backend secrets.

## What is explicitly not promised

- Audit. There is none — the pre-submission pass above was internal
  hygiene, not an external security audit.
- Production support. There isn't any.
- A bug bounty. We do not offer one for the hackathon prototype.
