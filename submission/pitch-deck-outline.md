---
marp: true
theme: default
paginate: true
size: 16:9
backgroundColor: "#FAF7F2"
color: "#1A1A1A"
header: "Conexple · Colosseum Frontier 2026"
footer: "github.com/conexple/alpha · Apache 2.0"
style: |
  section { font-family: 'Georgia', 'IBM Plex Serif', serif; padding: 60px 80px; }
  h1 { color: #1A1A1A; border-bottom: 2px solid #6B7C5A; padding-bottom: 10px; }
  ul { line-height: 1.65; font-size: 0.95em; }
  header, footer { color: #7A7A7A; font-size: 0.65em; }
  section.lead { text-align: left; }
  section.lead h1 { font-size: 2.4em; border-bottom: none; margin-bottom: 0.6em; }
  section.lead ul { font-size: 1.05em; list-style: none; padding-left: 0; }
  section.lead li { margin: 0.4em 0; }
  strong { color: #5B6E48; }
---

<!-- _class: lead -->

# Conexple

- Open consumer affiliate protocol on Solana
- Pay loyal customers — not influencers
- Bosso · Sornkan Co. · Bangkok, Thailand
- suanwin.paows@gmail.com

---

# The problem

- ~80% of affiliate revenue flows to professional influencers
- 0% flows to the customers who actually buy the product
- Merchants pay it anyway — it's a price of doing business
- Source: industry consensus, cite Statista or AffiliateWP inline

---

# Why this is broken

- Influencers don't move the needle for most product categories
- Loyal customers refer friends — and get nothing back
- Existing loyalty programs don't compound across tiers
- The affiliate budget exists; the routing is wrong

---

# Conexple — same budget, redistributed

- Every purchase splits into seven parts
- Five parts to the buyer's upline (five levels deep)
- One part funds a public, on-chain social pool
- One part is an Infinity Override for long-term active members
- Merchant pays nothing extra

---

# Why this is not MLM

- 50% margin cap — enforced on-chain
- No recruitment requirement — earnings depend on purchases
- No auto-assign — placements only come from a referral
- 5-level depth cap — no infinite pyramid
- Apache 2.0 — forkable if the operator misbehaves

---

# Mechanics — one purchase, traced

- Diagram of a leaf wallet's purchase flowing up 5 levels
- Each upline accrues a deterministic share
- Social pool catches the remainder
- All accruals visible on Solscan in real time

---

# Why Solana

- Per-purchase commissions at sub-cent fees
- Daily settlement at near-zero gas
- USDC settlement matches merchant expectations
- Helius and Triton One are official ecosystem partners
- This economic model doesn't work on Ethereum at this scale

---

# Live demo — devnet, today

- Web: conexple-worker-web.sornwin.workers.dev
- 4 Anchor programs deployed, 21 positions across 3 trees, 4 merchants
- Total on-chain earnings distributed: 2,638 base units across 6 wallets
- BYOK proof: a third-party merchant plugged in end-to-end on chain

---

# Architecture

- 4 Anchor programs: protocol, network, escrow, oracle
- Cloudflare Workers: operator backend + static web frontend
- D1 for off-chain mirror, KV for RPC cache, Queue for ingest
- Cron Trigger drives the daily settlement run

---

# Market entry

- Thailand: ~$10B annual e-commerce affiliate flow
- ASEAN expansion arc: Thailand → Vietnam → Indonesia → Philippines
- First operator: Conexple Thailand (Sornkan Co.)
- 5 merchants in Q3, 50 by year-end

---

# Business model

- Operator takes 10% of social pool (configurable per network)
- No token launch
- Settlement currency: USDC (mainnet target — devnet uses mock)
- Protocol stays open; operators compete on UX

---

# Compliance — Thai direct-selling law

- Designed against พ.ร.บ. ขายตรงฯ 2545
- No auto-assign of placements (legal red line)
- No recruitment-required qualification
- Margin cap and pool-distribution rules on-chain
- Submission opts into Public Goods award

---

# Team

- Bosso — founder, designer + dev
- Sornkan Co. operates Thai consumer brands today
- We will operate Conexple Thailand as the first network
- The protocol stays open for any operator

---

# Ask + close

- Repo: github.com/conexple/alpha (Apache 2.0)
- Demo: conexple-worker-web.sornwin.workers.dev
- Pitch video: see submission
- Ask: a Frontier slot, then accelerator conversation
- Open protocol. Thai-rooted. ASEAN-bound.
