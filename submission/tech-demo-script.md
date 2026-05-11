# Technical demo video script — 2–3 minutes

> Audience: technical members of the Colosseum panel + judges
> verifying that the system actually works.
>
> Goal: show the architecture briefly, then prove with a live demo
> that we have working on-chain primitives. The pitch is in the
> separate ≤ 3 min pitch video.

## Visual structure

- Screen recording, no face cam.
- Browser + a terminal side-by-side. Optional: an architecture
  diagram for the first 30 seconds.

## Storyboard (target run-time 2:30)

### 0:00–0:25 — Architecture overview (diagram on screen)

**Show the architecture diagram from the deck or `README.md`.**

VO:
> "Conexple has four Anchor programs deployed to Solana devnet:
> protocol — the rules, network — Position state, escrow — USDC
> vaults and payouts, and oracle — the registered backend signer.
>
> Off-chain, a Cloudflare Worker holds the operator backend: a
> Hono router, a D1 database mirror of position state, a KV-backed
> RPC cache, a Queue for purchase ingest, and a Cron Trigger for
> the daily settlement run.
>
> The frontend is a Next.js static export served from a second
> Cloudflare Worker."

### 0:25–0:55 — The home page + simulator (browser)

**Open `https://conexple-worker-web.sornwin.workers.dev/`.**

VO:
> "Landing page lays out the pitch in thirty seconds. The diagram
> on the right shows the seven-way split.
>
> Scroll down — 'One protocol, many operators' is our main message.
> Conexple is a protocol, not a single platform. We're the first
> operator on chain; the architecture supports anyone forking the
> operator code and running their own network on the same Solana
> programs. Apache 2.0, no gatekeeping.
>
> The simulator at `/simulator` lets any judge play with the math.
> No wallet required."

**Hover the simulator briefly to show interaction.**

### 0:55–1:30 — Explorer + connect wallet (browser)

**Open `/explorer/`.**

VO:
> "The explorer shows live on-chain state: twenty-one Position
> accounts across three trees, four merchants, total earnings of
> 2,638 base units distributed across six wallets. All decoded from
> Anchor accounts via a Cloudflare Worker RPC cache.
>
> Click 'Connect → see your position'. If the connected wallet is
> one of the 21 demo wallets (A through R, plus W, Y, Z), it sees
> its position, depth, status, and cap progress. Otherwise it gets a
> friendly 'no position yet' panel with a referral CTA."

### 1:30–2:00 — Trigger a purchase (terminal)

**Switch to terminal.**

```bash
PURCHASER=E AMOUNT=1000 pnpm smoke
```

VO:
> "We trigger a purchase on devnet for wallet E. The script signs
> `record_purchase` via the oracle key and submits it.
>
> Output: a transaction signature. Let's open it on Solscan."

**Click the Solscan link.**

VO:
> "Confirmed. You can see the program ID, the PurchaseRecord PDA,
> and the log entries. Anyone can verify this trace — that's the
> whole point."

### 2:00–2:25 — Operator dashboard + BYOK proof

**Switch back to the browser. Open `/operator/`.**

VO:
> "The operator dashboard shows recent settlement runs. Hit 'Trigger
> cycle now' — the Cloudflare Worker queries pending commissions in
> D1, builds the settlement instructions, and submits them on chain.
>
> Here's the BYOK proof: merchant 4 is a third-party merchant signed
> by its own keypair. When customer K purchased 8,000 units from it,
> four add_earnings instructions landed on chain in a single tx,
> distributing 571 base units to each of J, I, F, and A — four
> upline levels deep, all on Solscan."

### 2:25–2:30 — Outro

VO:
> "Code is at github.com/conexple/alpha — Apache 2.0, unaudited
> alpha. Pitch video covers the business side. Thanks for watching."

## Things you must show on screen at least once

- [ ] The deployed Worker URL in the browser address bar
- [ ] One Solscan transaction page, fully loaded, with our program ID visible
- [ ] The terminal output of `pnpm smoke` with `Confirmed` and the
      tx signature
- [ ] The repo URL `github.com/conexple/alpha` on GitHub
- [ ] At least one moment showing wallet-connected state (so judges
      know the wallet adapter actually works)

## What NOT to do

- Don't read the slides verbatim if you also include them.
- Don't try to explain the entire ÷7 split mechanism here — that's
  in the pitch video, and the simulator does it visually.
- Don't show your wallet seed or any keypair JSON.
- Don't apologize for the alpha/devnet status — say it once, move on.
