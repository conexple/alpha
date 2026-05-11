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

      <div className="mt-8 rounded-3xl border border-edge bg-paper p-5 sm:p-10">
        <EcosystemDiagram />
      </div>

      <p className="mt-8 max-w-3xl text-sm leading-relaxed text-graphite">
        This is what &quot;open protocol&quot; means in practice. We ship a reference
        operator — you don&apos;t have to use it. The Solana programs are the only
        load-bearing part; everything else is replaceable. No API keys, no
        royalties, no gatekeeping. Apache 2.0.
      </p>
    </section>
  );
}

function EcosystemDiagram() {
  return (
    <div className="space-y-6">
      <TierRow label="Protocol">
        <div className="rounded-2xl bg-ink p-6 text-cream sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-cream/55">
                Immutable on Solana
              </div>
              <h3 className="mt-2 font-display text-2xl leading-tight text-cream sm:text-[28px]">
                Conexple Protocol
              </h3>
              <p className="mt-1.5 text-sm text-cream/75">
                4 Anchor programs · deployed once · shared by every operator
              </p>
            </div>
            <ul className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-col lg:grid lg:grid-cols-2">
              {["protocol", "network", "escrow", "oracle"].map((p) => (
                <li
                  key={p}
                  className="rounded-md bg-cream/12 px-2.5 py-1 font-mono text-[11px] text-cream/95"
                >
                  conexple_{p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </TierRow>

      <Connector label="CPI · any operator can call" />

      <TierRow label="Operators">
        <div className="grid gap-3 md:grid-cols-3">
          <OperatorBox
            name="Conexple Thailand"
            status="live"
            hint="first operator · reference implementation"
            merchants={[
              "Demo Merchant 01",
              "Demo Merchant 02",
              "Demo Merchant 03",
              "Merchant 04 (BYOK)",
            ]}
            highlightLast
            meta="network_id=1"
          />
          <OperatorBox
            name="E-commerce Operator"
            status="example"
            hint="how a partner platform could plug in"
            merchants={["Online Marketplace", "Retail Stores", "Wholesale Channel"]}
            meta="illustrative · not on chain"
          />
          <OperatorBox
            name="Your Operator?"
            status="open"
            hint="fork the code · deploy your network"
            merchants={[]}
            meta="github.com/conexple/alpha"
          />
        </div>
      </TierRow>

      <Connector label="any wallet · any operator" />

      <TierRow label="Consumer">
        <div className="rounded-2xl border-2 border-cnx-amber bg-cnx-amber/10 p-6 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-cnx-amber">
            One key · many networks
          </div>
          <h4 className="mt-2 font-display text-xl text-ink sm:text-2xl">
            A Consumer Wallet
          </h4>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-graphite">
            The same Phantom wallet holds a Position in any operator&apos;s network.
            Commissions stay within each network&apos;s scope.
          </p>
        </div>
      </TierRow>
    </div>
  );
}

function TierRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[76px_1fr] sm:items-start sm:gap-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-stone sm:pt-5 sm:text-right">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Connector({ label }: { label: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[76px_1fr] sm:items-center sm:gap-5">
      <div className="hidden sm:block" />
      <div className="flex items-center gap-3 text-stone">
        <span className="h-px flex-1 bg-edge" />
        <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.2em]">
          ↓ {label}
        </span>
        <span className="h-px flex-1 bg-edge" />
      </div>
    </div>
  );
}

type OperatorStatus = "live" | "example" | "open";

function OperatorBox({
  name,
  status,
  hint,
  merchants,
  highlightLast,
  meta,
}: {
  name: string;
  status: OperatorStatus;
  hint: string;
  merchants: string[];
  highlightLast?: boolean;
  meta: string;
}) {
  const cardClass =
    status === "live"
      ? "border-cnx-olive bg-paper"
      : status === "example"
      ? "border-cnx-amber/55 bg-paper"
      : "border-edge bg-cream/40 border-dashed";

  const pillClass =
    status === "live"
      ? "bg-cnx-olive text-cream"
      : status === "example"
      ? "bg-cnx-amber text-ink"
      : "bg-edge text-graphite";

  const pillLabel =
    status === "live" ? "Live" : status === "example" ? "Illustrative" : "Open · fork it";

  return (
    <article className={`flex flex-col gap-4 rounded-2xl border-2 p-5 ${cardClass}`}>
      <div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] font-medium ${pillClass}`}
        >
          {pillLabel}
        </span>
        <h4 className="mt-3 font-display text-lg leading-tight text-ink">{name}</h4>
        <p className="mt-1 text-xs text-graphite">{hint}</p>
      </div>

      <div>
        <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.22em] text-stone">
          Merchants
        </div>
        {merchants.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {merchants.map((m, i) => {
              const isHighlight = highlightLast && i === merchants.length - 1;
              return (
                <li
                  key={m}
                  className={
                    isHighlight
                      ? "rounded-md border border-cnx-amber bg-cnx-amber/15 px-2 py-1 font-mono text-[11px] font-medium text-ink"
                      : "rounded-md bg-cream px-2 py-1 font-mono text-[11px] text-graphite"
                  }
                >
                  {m}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-md border border-dashed border-edge px-3 py-3 text-center font-mono text-[11px] italic text-stone">
            your merchants here
          </div>
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
