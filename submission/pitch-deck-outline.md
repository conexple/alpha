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
- Same merchant budget, redirected on chain
- Built from Bangkok · Apache 2.0

---

# Why we built this

- **AI and robotics will displace much of what humans do for income**
- The next economy will need an alternative — basic income that doesn't wait for the state
- **Consumption** is the one thing humans uniquely do, every day, without thinking
- Today there is no reward for being a consumer — buyers fund commerce, share none of its returns
- Conexple turns consumption into **community-funded basic income**

---

# The problem

- Global affiliate marketing: **$17–18B annually**, growing ~14% YoY (Post Affiliate Pro, 2025)
- The entire pool flows to creators, publishers, coupon sites
- **0% reaches the customer** whose purchase generated the commission
- Merchants pay it anyway. The routing is wrong.

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

# Direct Sale, on chain

- Direct sale is a legitimate, regulated commerce category — buyers refer buyers, get rewarded
- The problem has always been trust: no one verifies the margins, placements, or rules
- Conexple puts every guarantee on Solana — enforced in code, not paper
- **50% margin cap · earnings tied to purchases · placements only from referral**
- **5 levels deep, bounded · Apache 2.0, fork it anytime**

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
- Production RPC via Helius (Frontier's official partner) — mainnet is a config change
- This economic model doesn't work on Ethereum at this scale

---

# The longer arc — a consumer-funded basic income

- **Not waiting for the state · not a token airdrop**
- Commerce already pays a commission — Conexple just redirects it to the buyer
- No selling, no recruiting, no quotas — just buy what you'd buy anyway
- **Positions expire** after inactivity → opportunity **rotates** through new consumers
- A flow, not a pyramid — the seats stay open

---

# Architecture

- 4 Anchor programs: protocol, network, escrow, oracle
- Cloudflare Workers: operator backend + static web frontend
- D1 for off-chain mirror, KV for RPC cache, Queue for ingest
- Cron Trigger drives the daily settlement run

---

# Market entry

- SEA influencer-driven e-commerce: **up to $46B annually**, **$21B directly trackable affiliate** (Cube × impact.com SEA Influencer Marketing Report, 2025)
- Thailand: **16% of SEA e-commerce**, **83% buy on creator recommendation** (Priceza · Thailand E-Commerce Trends 2025)
- ASEAN arc: Thailand → Vietnam → Indonesia → Philippines
- First operator: Conexple Thailand; 5 merchants Q3, 50 by year-end

---

# Business model

- Operator takes 10% of social pool (configurable per network)
- No token launch
- Settlement currency: USDC (mainnet target — devnet uses mock)
- Protocol stays open; operators compete on UX

---

# Compliance — Thai direct-selling law

- Designed against Thailand's Direct Selling Act (B.E. 2545 / 2002)
- No auto-assign of placements (legal red line)
- No recruitment-required qualification
- Margin cap and pool-distribution rules on-chain
- Submission opts into Public Goods award

---

# The team

- **Boss** — 10 years full-stack engineering · Rust · Cloudflare ecosystem · AI integrations
- **Kan** — Computing teacher · Education design · AI Games used by other teachers
- **Pee** — Web hosting engineer · Daily contact with small Thai e-commerce merchants
- **Ta** — Enterprise helpdesk · Years of non-technical user support
- Same Kasetsart Faculty of Education cohort · five years shipping together
- Bangkok-based

---

<!-- _class: lead -->

# Thank you

- Conexple · Frontier 2026
- alpha.conexple.com
- github.com/conexple/alpha · Apache 2.0
