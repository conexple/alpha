import Link from "next/link";
import { HomeNetworkPreview } from "@/components/HomeNetworkPreview";
import { TxFeed } from "@/components/TxFeed";
import { PubkeyChip } from "@/components/PubkeyChip";

const PROGRAM_IDS = [
  { name: "conexple_protocol", id: "D1HVppRLhT6wmUxmaM4QABytmcBDEmKuuuMoa7HkKSbn", role: "rules + verify_placement" },
  { name: "conexple_network",  id: "9nrHZqJcT3zLcK6eTu7ZLBBAU3Rr2eecnFYF413YePt9", role: "Position state, single-source-of-truth" },
  { name: "conexple_escrow",   id: "9eTvjKrfbYy6JhFMJnuFo5ATCN6uS115J196bvPbmMXU", role: "merchant USDC vaults + payout splits" },
  { name: "conexple_oracle",   id: "9CQFV9oPYKWE4Yg4w8mwJxsdibPeZJrKoTqcp2iTi1qz", role: "registered backend signers + audit log" },
];

export default function Home() {
  return (
    <div className="space-y-24">
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-7 lg:pt-6">
          <span className="pill">
            <span className="h-1.5 w-1.5 rounded-full bg-cnx-olive" />
            Solana devnet · v0.1 alpha
          </span>
          <h1 className="mt-6 font-display text-5xl leading-[1.05] tracking-tightest text-ink sm:text-6xl lg:text-7xl">
            Pay loyal customers,
            <br />
            <em className="not-italic text-cnx-purple">not influencers.</em>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-graphite">
            Conexple is an open-source consumer affiliate protocol on Solana.
            Merchants don't pay more — the same affiliate budget redistributes
            across <strong className="text-ink">5 levels of upline consumers</strong>{" "}
            and a public social pool. Every rule, every payout, every position
            lives on chain.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="group inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-cream transition-transform hover:-translate-y-0.5"
            >
              See your position
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
            <Link
              href="/explorer"
              className="rounded-full border border-edge bg-paper px-6 py-3 text-sm font-medium text-graphite transition-colors hover:border-ink hover:text-ink"
            >
              Explore the network
            </Link>
            <a
              href="/simulator"
              className="rounded-full border border-edge bg-paper px-6 py-3 text-sm font-medium text-graphite transition-colors hover:border-ink hover:text-ink"
            >
              Interactive simulator
            </a>
          </div>

          <dl className="mt-12 grid grid-cols-2 gap-8 border-t border-edge pt-8 sm:grid-cols-4">
            <Stat n="÷7" l="commission slots" />
            <Stat n="50%" l="margin cap on-chain" />
            <Stat n="5" l="levels of upline reward" />
            <Stat n="0" l="recruitment requirement" />
          </dl>
        </div>

        <div className="lg:col-span-5">
          <SplitDiagram />
        </div>
      </section>

      {/* ── ANTI-MLM TABLE ──────────────────────────────────────────────── */}
      <section>
        <h2 className="font-display text-3xl text-ink">
          Why this is structurally not MLM
        </h2>
        <p className="mt-2 max-w-2xl text-graphite">
          Anti-MLM isn't a marketing claim — it's enforced in the smart
          contract. Every guarantee below has a corresponding line of Rust.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Guarantee
            head="50% margin cap"
            body="initialize_rules rejects margin_bps > 5000. Real product value cannot fall below half of the price."
            meta="conexple_protocol::ConexpleProtocolError::MarginCapExceeded"
          />
          <Guarantee
            head="No recruitment requirement"
            body="Commission is gated by a wallet's own purchases each round, not by people they referred."
            meta="record_purchase + last_purchase_round"
          />
          <Guarantee
            head="No auto-assign"
            body="Placement always comes from a referral. New members without a referrer remain unplaced — commission flows to the social pool."
            meta="place_member requires parent_position"
          />
          <Guarantee
            head="Capped tier depth"
            body="MAX_PLACEMENT_DEPTH = 5. The contract refuses placements past level 5. No infinite pyramid."
            meta="ConexpleNetworkError::PlacementTooDeep"
          />
          <Guarantee
            head="Daily-min settlement"
            body="Cycles faster than daily are rejected. Stops minutely-cycle harvesting tricks."
            meta="ConexpleProtocolError::CycleTooFast"
          />
          <Guarantee
            head="Open protocol, forkable"
            body="Apache 2.0. Anyone deploys their own network. The 'company' can't run with the rules — there's no upgrade authority on rules once initialized."
            meta="programs/conexple-protocol"
          />
        </div>
      </section>

      {/* ── ECOSYSTEM (multi-operator) ──────────────────────────────────── */}
      <EcosystemSection />

      {/* ── LIVE NETWORK ────────────────────────────────────────────────── */}
      <HomeNetworkPreview />

      {/* ── PROGRAM IDS ─────────────────────────────────────────────────── */}
      <section className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="font-display text-3xl text-ink">
            Four Anchor programs.
            <br />
            One open protocol.
          </h2>
          <p className="mt-3 max-w-xl text-graphite">
            Single source of truth per program. Other programs go through CPI —
            no shared mutability, no operator backdoor.
          </p>
          <ul className="mt-6 divide-y divide-edge rounded-2xl border border-edge bg-paper">
            {PROGRAM_IDS.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:gap-6">
                <div className="flex-1">
                  <div className="font-mono text-sm font-medium text-ink">{p.name}</div>
                  <div className="text-xs text-stone">{p.role}</div>
                </div>
                <PubkeyChip value={p.id} />
              </li>
            ))}
          </ul>
        </div>

        <TxFeed limit={6} />
      </section>

      {/* ── FOR JUDGES ─────────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-edge bg-paper p-8 sm:p-12">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <span className="pill">
              <span className="h-1.5 w-1.5 rounded-full bg-cnx-amber" />
              Colosseum Frontier 2026
            </span>
            <h2 className="mt-4 font-display text-3xl text-ink">For the judges</h2>
            <p className="mt-3 text-graphite">
              This deployment is on Solana devnet. The network is pre-seeded —
              connect a Phantom wallet pointed at devnet to see your position.
              Pitch + technical demo videos linked from the README.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <a
                href="https://github.com/conexple/alpha"
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-edge bg-cream px-5 py-2.5 font-medium text-graphite hover:border-ink hover:text-ink"
              >
                GitHub repo →
              </a>
              <a
                href="https://solscan.io/account/D1HVppRLhT6wmUxmaM4QABytmcBDEmKuuuMoa7HkKSbn?cluster=devnet"
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-edge bg-cream px-5 py-2.5 font-medium text-graphite hover:border-ink hover:text-ink"
              >
                Programs on Solscan ↗
              </a>
            </div>
          </div>
          <div className="space-y-4 text-sm text-graphite">
            <Bullet num="①" body="Read the one-paragraph pitch (top of this page)." />
            <Bullet num="②" body="Open the architecture in docs/architecture.md (link in footer)." />
            <Bullet num="③" body="Connect Phantom on devnet — dashboard auto-loads your position from chain." />
            <Bullet num="④" body="Watch the live tx feed. Each entry is a Solscan-verifiable on-chain transaction from our network program." />
            <Bullet num="⑤" body="Trigger a manual settlement run from /operator. The Cloudflare Worker signs and submits via the registered oracle." />
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <dt className="font-display text-3xl text-ink">{n}</dt>
      <dd className="mt-1 text-xs uppercase tracking-[0.16em] text-stone">{l}</dd>
    </div>
  );
}

function Guarantee({ head, body, meta }: { head: string; body: string; meta: string }) {
  return (
    <article className="card flex flex-col gap-3">
      <h3 className="font-display text-xl text-ink">{head}</h3>
      <p className="text-sm leading-relaxed text-graphite">{body}</p>
      <code className="mt-auto font-mono text-[10px] text-stone">{meta}</code>
    </article>
  );
}

function Bullet({ num, body }: { num: string; body: string }) {
  return (
    <p className="flex gap-3">
      <span className="font-display text-cnx-amber">{num}</span>
      <span>{body}</span>
    </p>
  );
}

function EcosystemSection() {
  return (
    <section>
      <h2 className="font-display text-3xl text-ink">
        One protocol, many operators
      </h2>
      <p className="mt-2 max-w-2xl text-graphite">
        Conexple is a protocol — not a single platform. The Solana programs are
        immutable and shared. Anyone can run their own operator, with their own
        merchants, on the same protocol. We're the first operator; you could
        be the next.
      </p>

      {/* Hero visual — the diagram */}
      <div className="mt-8 overflow-hidden rounded-2xl border border-edge bg-paper p-4 sm:p-8">
        <EcosystemDiagram />
      </div>

      {/* Drill-down cards */}
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <OperatorCard
          name="Conexple Thailand"
          status="live"
          description="The first operator. Our Cloudflare Worker handles webhook ingest, cycle settle, and oracle signing."
          merchants={[
            "Demo Merchant 01",
            "Demo Merchant 02",
            "Demo Merchant 03",
            "Merchant 04 (BYOK)",
          ]}
          meta="network_id=1 · sornwin.workers.dev"
        />
        <OperatorCard
          name="Lazada-style Operator"
          status="example"
          description="How a SE Asian e-commerce platform could plug in — running its own operator on the same protocol."
          merchants={["Lazada Stores", "Lazada Mall", "Lazada Wholesale"]}
          meta="hypothetical · not on chain"
        />
        <OperatorCard
          name="Your Operator?"
          status="open"
          description="Fork operator code under Apache 2.0. Deploy to your own Cloudflare. Bootstrap your network."
          merchants={[]}
          meta="github.com/conexple/alpha"
        />
      </div>

      <p className="mt-8 max-w-3xl text-sm leading-relaxed text-graphite">
        This is what "open protocol" means in practice. We ship a reference
        operator — you don't have to use it. The Solana programs are the only
        load-bearing part; everything else is replaceable. No API keys, no
        royalties, no gatekeeping. Apache 2.0.
      </p>
    </section>
  );
}

function EcosystemDiagram() {
  return (
    <svg
      viewBox="0 0 720 480"
      className="block h-auto w-full"
      role="img"
      aria-label="Conexple ecosystem: protocol layer feeds three operators (Conexple Thailand live, Lazada-style example, your operator open). Each operator has its own merchants. A consumer wallet can connect to any operator network."
    >
      <defs>
        <marker id="arrowOlive" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 Z" fill="#5B6E48" />
        </marker>
        <marker id="arrowAmber" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,0 L10,5 L0,10 Z" fill="#C8A765" />
        </marker>
      </defs>

      {/* Tier labels (left side) */}
      <text x="14" y="50" fontFamily="'JetBrains Mono', monospace" fontSize="9" fill="#6F6B5E" letterSpacing="2">
        PROTOCOL
      </text>
      <text x="14" y="232" fontFamily="'JetBrains Mono', monospace" fontSize="9" fill="#6F6B5E" letterSpacing="2">
        OPERATORS
      </text>
      <text x="14" y="412" fontFamily="'JetBrains Mono', monospace" fontSize="9" fill="#6F6B5E" letterSpacing="2">
        CONSUMERS
      </text>

      {/* === Tier 1: Protocol (immutable, shared) === */}
      <rect x="160" y="20" width="400" height="84" rx="12" fill="#5B6E48" />
      <text x="360" y="48" textAnchor="middle" fill="white" fontFamily="'Crimson Pro', Georgia, serif" fontSize="18" fontWeight="700">
        Conexple Protocol
      </text>
      <text x="360" y="68" textAnchor="middle" fill="rgba(255,255,255,0.78)" fontFamily="'JetBrains Mono', monospace" fontSize="10" letterSpacing="1">
        4 ANCHOR PROGRAMS · IMMUTABLE ON SOLANA
      </text>
      {/* program chips */}
      <g fontFamily="'JetBrains Mono', monospace" fontSize="9" fill="rgba(255,255,255,0.92)">
        <rect x="180" y="80" width="76" height="18" rx="4" fill="rgba(255,255,255,0.14)" />
        <text x="218" y="92" textAnchor="middle">protocol</text>
        <rect x="262" y="80" width="76" height="18" rx="4" fill="rgba(255,255,255,0.14)" />
        <text x="300" y="92" textAnchor="middle">network</text>
        <rect x="344" y="80" width="76" height="18" rx="4" fill="rgba(255,255,255,0.14)" />
        <text x="382" y="92" textAnchor="middle">escrow</text>
        <rect x="426" y="80" width="76" height="18" rx="4" fill="rgba(255,255,255,0.14)" />
        <text x="464" y="92" textAnchor="middle">oracle</text>
      </g>

      {/* === CPI lines (protocol → operators) === */}
      <line x1="220" y1="104" x2="160" y2="170" stroke="#5B6E48" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arrowOlive)" />
      <line x1="360" y1="104" x2="360" y2="170" stroke="#5B6E48" strokeWidth="1.5" markerEnd="url(#arrowOlive)" />
      <line x1="500" y1="104" x2="560" y2="170" stroke="#5B6E48" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arrowOlive)" />

      <text x="190" y="142" fontFamily="'JetBrains Mono', monospace" fontSize="9" fill="#5B6E48" textAnchor="end">CPI</text>
      <text x="370" y="142" fontFamily="'JetBrains Mono', monospace" fontSize="9" fill="#5B6E48">CPI</text>
      <text x="530" y="142" fontFamily="'JetBrains Mono', monospace" fontSize="9" fill="#5B6E48">CPI</text>

      {/* === Tier 2: Operator 1 — Conexple Thailand (LIVE) === */}
      <rect x="40" y="170" width="240" height="160" rx="10" fill="#FFFFFF" stroke="#5B6E48" strokeWidth="2" />
      <rect x="48" y="178" width="76" height="18" rx="9" fill="#5B6E48" />
      <text x="86" y="190" textAnchor="middle" fill="white" fontFamily="'JetBrains Mono', monospace" fontSize="9" letterSpacing="1" fontWeight="700">
        LIVE
      </text>
      <text x="160" y="210" textAnchor="middle" fill="#1A1A1A" fontFamily="'Crimson Pro', Georgia, serif" fontSize="16" fontWeight="700">
        Conexple Thailand
      </text>
      <text x="160" y="226" textAnchor="middle" fill="#5C5C5C" fontFamily="'IBM Plex Sans Thai', sans-serif" fontSize="10">
        first operator · our reference impl
      </text>
      {/* merchant chips */}
      <g fontFamily="'JetBrains Mono', monospace" fontSize="9" fill="#38362E">
        <rect x="55" y="240" width="100" height="22" rx="4" fill="#F4EFE6" />
        <text x="105" y="255" textAnchor="middle">Demo Merchant 01</text>
        <rect x="165" y="240" width="100" height="22" rx="4" fill="#F4EFE6" />
        <text x="215" y="255" textAnchor="middle">Demo Merchant 02</text>
        <rect x="55" y="268" width="100" height="22" rx="4" fill="#F4EFE6" />
        <text x="105" y="283" textAnchor="middle">Demo Merchant 03</text>
        <rect x="165" y="268" width="100" height="22" rx="4" fill="#FBF0D6" stroke="#C8A765" />
        <text x="215" y="283" textAnchor="middle" fontWeight="700">Merchant 04 BYOK</text>
      </g>
      <text x="160" y="316" textAnchor="middle" fill="#6F6B5E" fontFamily="'JetBrains Mono', monospace" fontSize="9">
        network_id=1
      </text>

      {/* === Tier 2: Operator 2 — Lazada-style (EXAMPLE) === */}
      <rect x="292" y="170" width="200" height="160" rx="10" fill="#FFFFFF" stroke="#C8A765" strokeWidth="2" />
      <rect x="300" y="178" width="100" height="18" rx="9" fill="#C8A765" />
      <text x="350" y="190" textAnchor="middle" fill="#1A1A1A" fontFamily="'JetBrains Mono', monospace" fontSize="9" letterSpacing="1" fontWeight="700">
        ILLUSTRATIVE
      </text>
      <text x="392" y="210" textAnchor="middle" fill="#1A1A1A" fontFamily="'Crimson Pro', Georgia, serif" fontSize="16" fontWeight="700">
        Lazada-style Op
      </text>
      <text x="392" y="226" textAnchor="middle" fill="#5C5C5C" fontFamily="'IBM Plex Sans Thai', sans-serif" fontSize="10">
        a partner could plug in here
      </text>
      <g fontFamily="'JetBrains Mono', monospace" fontSize="9" fill="#38362E">
        <rect x="304" y="240" width="86" height="22" rx="4" fill="#F4EFE6" />
        <text x="347" y="255" textAnchor="middle">Lazada Mall</text>
        <rect x="394" y="240" width="86" height="22" rx="4" fill="#F4EFE6" />
        <text x="437" y="255" textAnchor="middle">Lazada Stores</text>
        <rect x="304" y="268" width="86" height="22" rx="4" fill="#F4EFE6" />
        <text x="347" y="283" textAnchor="middle">Wholesale</text>
      </g>
      <text x="392" y="316" textAnchor="middle" fill="#6F6B5E" fontFamily="'JetBrains Mono', monospace" fontSize="9">
        hypothetical · not on chain
      </text>

      {/* === Tier 2: Operator 3 — Your Operator (OPEN) === */}
      <rect x="504" y="170" width="176" height="160" rx="10" fill="#FAF7F2" stroke="#6F6B5E" strokeWidth="2" strokeDasharray="5 3" />
      <rect x="512" y="178" width="86" height="18" rx="9" fill="#E8E1D2" />
      <text x="555" y="190" textAnchor="middle" fill="#38362E" fontFamily="'JetBrains Mono', monospace" fontSize="9" letterSpacing="1" fontWeight="700">
        OPEN · FORK IT
      </text>
      <text x="592" y="210" textAnchor="middle" fill="#1A1A1A" fontFamily="'Crimson Pro', Georgia, serif" fontSize="16" fontWeight="700">
        Your Operator?
      </text>
      <text x="592" y="226" textAnchor="middle" fill="#5C5C5C" fontFamily="'IBM Plex Sans Thai', sans-serif" fontSize="10">
        deploy under Apache 2.0
      </text>
      <rect x="516" y="240" width="152" height="50" rx="4" fill="transparent" stroke="#6F6B5E" strokeWidth="1" strokeDasharray="3 3" />
      <text x="592" y="262" textAnchor="middle" fill="#6F6B5E" fontFamily="'IBM Plex Sans Thai', sans-serif" fontSize="11" fontStyle="italic">
        your merchants
      </text>
      <text x="592" y="278" textAnchor="middle" fill="#6F6B5E" fontFamily="'IBM Plex Sans Thai', sans-serif" fontSize="11" fontStyle="italic">
        here
      </text>
      <text x="592" y="316" textAnchor="middle" fill="#6F6B5E" fontFamily="'JetBrains Mono', monospace" fontSize="9">
        github.com/conexple/alpha
      </text>

      {/* === Consumer wallet (bottom) + curved connection lines === */}
      <path d="M 260 360 Q 200 348, 160 332" fill="none" stroke="#C8A765" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.75" markerEnd="url(#arrowAmber)" />
      <path d="M 360 360 L 360 332" stroke="#C8A765" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.75" markerEnd="url(#arrowAmber)" />
      <path d="M 460 360 Q 520 348, 568 332" fill="none" stroke="#C8A765" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.75" markerEnd="url(#arrowAmber)" />

      {/* Consumer wallet pill */}
      <rect x="240" y="368" width="240" height="64" rx="32" fill="#C8A765" />
      <text x="360" y="394" textAnchor="middle" fill="white" fontFamily="'Crimson Pro', Georgia, serif" fontSize="15" fontWeight="700">
        A Consumer Wallet
      </text>
      <text x="360" y="412" textAnchor="middle" fill="rgba(255,255,255,0.88)" fontFamily="'IBM Plex Sans Thai', sans-serif" fontSize="11">
        same Phantom key · multiple networks
      </text>

      {/* Footnote helper */}
      <text x="160" y="354" textAnchor="middle" fill="#C8A765" fontFamily="'JetBrains Mono', monospace" fontSize="8" letterSpacing="1">
        registers in
      </text>
      <text x="360" y="354" textAnchor="middle" fill="#C8A765" fontFamily="'JetBrains Mono', monospace" fontSize="8" letterSpacing="1">
        registers in
      </text>
      <text x="568" y="354" textAnchor="middle" fill="#C8A765" fontFamily="'JetBrains Mono', monospace" fontSize="8" letterSpacing="1">
        registers in
      </text>

      {/* Tier separators (subtle horizontal lines on left for context) */}
      <line x1="100" y1="62" x2="120" y2="62" stroke="#E8E1D2" strokeWidth="1" />
      <line x1="100" y1="246" x2="120" y2="246" stroke="#E8E1D2" strokeWidth="1" />
      <line x1="100" y1="406" x2="120" y2="406" stroke="#E8E1D2" strokeWidth="1" />
    </svg>
  );
}

type OperatorStatus = "live" | "example" | "open";

function OperatorCard({
  name,
  status,
  description,
  merchants,
  meta,
}: {
  name: string;
  status: OperatorStatus;
  description: string;
  merchants: string[];
  meta: string;
}) {
  const cardClass =
    status === "live"
      ? "border-cnx-olive bg-paper"
      : status === "example"
      ? "border-cnx-amber/40 bg-paper"
      : "border-dashed border-edge bg-cream/40";

  const pillClass =
    status === "live"
      ? "bg-cnx-olive text-cream"
      : status === "example"
      ? "bg-cnx-amber text-ink"
      : "bg-edge text-graphite";

  const pillLabel =
    status === "live"
      ? "Live · on chain"
      : status === "example"
      ? "Illustrative example"
      : "Open · fork it";

  return (
    <article className={`flex flex-col gap-4 rounded-2xl border p-5 ${cardClass}`}>
      <header>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-[0.12em] font-medium ${pillClass}`}
        >
          {pillLabel}
        </span>
        <h3 className="mt-3 font-display text-lg text-ink">{name}</h3>
        <p className="mt-1 text-sm leading-relaxed text-graphite">{description}</p>
      </header>

      <div>
        <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-stone">
          Merchants
        </div>
        {merchants.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {merchants.map((m) => (
              <li
                key={m}
                className="rounded-md bg-cream px-2 py-1 font-mono text-[11px] text-graphite"
              >
                {m}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-edge bg-paper/60 px-3 py-2 text-[11px] italic text-stone">
            Your merchants here
          </p>
        )}
      </div>

      <footer className="mt-auto border-t border-edge pt-3">
        <code className="font-mono text-[10px] text-stone">{meta}</code>
      </footer>
    </article>
  );
}

function SplitDiagram() {
  // 7-slot split visualization. Each slot is a horizontal bar.
  const slots = [
    { l: 1, label: "Level 1 upline", recipient: "E", color: "bg-cnx-olive" },
    { l: 2, label: "Level 2 upline", recipient: "—", color: "bg-edge", muted: true },
    { l: 3, label: "Level 3 upline", recipient: "A", color: "bg-cnx-olive" },
    { l: 4, label: "Level 4 upline", recipient: "—", color: "bg-edge", muted: true },
    { l: 5, label: "Level 5 upline", recipient: "—", color: "bg-edge", muted: true },
    { l: 6, label: "Social pool",    recipient: "pool", color: "bg-cnx-amber" },
    { l: 7, label: "∞ override",      recipient: "—", color: "bg-edge", muted: true },
  ];
  return (
    <div className="card relative overflow-hidden">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="font-display text-xl text-ink">A purchase, divided ÷7</h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone">demo</span>
      </div>
      <p className="mb-5 font-mono text-xs text-graphite">
        F (lv5 leaf) buys 1,000 USDC. margin 50% → 500 commission split into 7.
      </p>
      <ul className="space-y-2">
        {slots.map((s) => (
          <li key={s.l} className="flex items-center gap-3">
            <span className="w-6 font-mono text-xs text-stone">{s.l}</span>
            <div className={`flex-1 rounded-md py-1.5 pl-3 text-xs ${s.color} ${s.muted ? "text-stone" : "text-cream"}`}>
              {s.label}
            </div>
            <span className={`font-mono text-xs ${s.muted ? "text-stone" : "text-graphite"}`}>
              {s.muted ? "→ pool" : `→ ${s.recipient}`}
            </span>
            <span className="num font-mono text-xs text-graphite">71.43</span>
          </li>
        ))}
      </ul>
      <p className="mt-5 border-t border-edge pt-4 text-[11px] leading-relaxed text-stone">
        Inactive levels fall through to the social pool — never wasted.
        Each commission anchors a 30-day refund window before settling.
      </p>
    </div>
  );
}
