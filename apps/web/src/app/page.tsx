import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="space-y-6 pt-8">
        <h1 className="text-balance text-4xl font-bold leading-tight md:text-6xl">
          Open consumer affiliate protocol{" "}
          <span className="bg-gradient-to-r from-cnx-accent to-cnx-accent2 bg-clip-text text-transparent">
            on Solana.
          </span>
        </h1>
        <p className="max-w-2xl text-balance text-lg text-white/80 md:text-xl">
          Redirect existing merchant marketing commissions to everyday
          consumers — not influencers. Every rule, every payout, every
          position is on-chain and publicly verifiable.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/dashboard"
            className="rounded-lg bg-gradient-to-r from-cnx-accent to-cnx-accent2 px-5 py-3 font-semibold text-cnx-ink"
          >
            Connect → see your position
          </Link>
          <Link
            href="/explorer"
            className="rounded-lg border border-white/20 px-5 py-3 text-white"
          >
            Browse the network
          </Link>
          <a
            href="/simulator.html"
            className="rounded-lg border border-white/20 px-5 py-3 text-white"
          >
            Interactive walkthrough →
          </a>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        <Card
          title="Anti-MLM by design"
          body="50% margin cap on-chain. No recruitment. No auto-assign. Capped tier depth at 5. You can read every rule."
        />
        <Card
          title="No new cost to merchants"
          body="The same affiliate budget — redistributed across the customer's 5-level upline plus a public social pool."
        />
        <Card
          title="Open protocol, not a company"
          body="Anyone can deploy a network. Conexple Thailand is the first operator. The protocol is Apache 2.0."
        />
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold">How a payout flows</h2>
          <p className="text-white/70">
            One purchase splits into 7 parts:
            <br />
            5 to upline consumers · 1 to a public social pool · 1 Infinity Override
          </p>
          <ul className="space-y-1 text-sm text-white/60">
            <li>· Inactive levels fall through to the social pool — never wasted.</li>
            <li>· Each commission anchors a 30-day refund window.</li>
            <li>· Settlement is batched at the cycle cut-off — daily by default.</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm">
          <pre className="whitespace-pre-wrap text-white/80">{ascii}</pre>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">For the judges</h2>
          <span className="text-xs text-cnx-muted">Colosseum Frontier 2026</span>
        </div>
        <p className="mt-2 text-white/80">
          This deployment runs on Solana <strong>devnet</strong>. The contracts are
          unaudited. The pitch video and architecture diagram are linked from the
          README. A pre-seeded demo network is already populated — connect a
          Phantom wallet pointed at devnet to see your position.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <a
            href="https://github.com/conexple/conexple"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-white/20 px-4 py-2"
          >
            GitHub →
          </a>
          <Link href="/operator" className="rounded-lg border border-white/20 px-4 py-2">
            Operator dashboard
          </Link>
          <Link href="/merchant" className="rounded-lg border border-white/20 px-4 py-2">
            Merchant view
          </Link>
        </div>
      </section>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-white/70">{body}</p>
    </div>
  );
}

const ascii = `Purchase 1,000  margin 50% = 500
divide ÷ 7 ≈ 71.43 each

slot 1 (lv1)  E  active   →  71.43
slot 2 (lv2)  B  inactive →   pool
slot 3 (lv3)  A  active   →  71.43
slot 4 (lv4)  ∅           →   pool
slot 5 (lv5)  ∅           →   pool
slot 6 social pool        →  71.43
slot 7 ∞-override (none)  →   pool
`;
