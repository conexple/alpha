"use client";

import { useEffect, useState } from "react";
import { readNetwork, type NetworkView, relativeTime } from "@/lib/program-clients";
import { StatTile } from "@/components/StatTile";
import { PubkeyChip } from "@/components/PubkeyChip";
import { TxFeed } from "@/components/TxFeed";

const OPERATOR_API =
  process.env.NEXT_PUBLIC_OPERATOR_URL ?? "https://conexple-worker-operator.sornwin.workers.dev";

interface Settlement {
  id: string;
  cycle_index: number;
  submitted_at: number;
  total_paid: number;
  status: string;
  error: string | null;
}

export default function OperatorPage() {
  const [network, setNetwork] = useState<NetworkView | null>(null);
  const [health, setHealth] = useState<{ ok: boolean; service?: string; cluster?: string; time?: string } | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    readNetwork().then(setNetwork);
    fetch(`${OPERATOR_API}/health`).then((r) => r.json()).then(setHealth).catch(() => {});
    refresh();
  }, []);

  async function refresh() {
    try {
      const r = await fetch(`${OPERATOR_API}/settle/status`);
      setSettlements(await r.json());
    } catch (e) {
      console.warn(e);
    }
  }

  async function triggerRun() {
    setRunning(true);
    setMessage(null);
    try {
      const r = await fetch(`${OPERATOR_API}/settle/run`, { method: "POST" });
      const j = await r.json();
      setMessage(`run submitted — ${JSON.stringify(j)}`);
      await refresh();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone">Operator console</span>
          <h1 className="mt-1 font-display text-4xl text-ink sm:text-5xl">
            Cycle scheduler
          </h1>
          <p className="mt-3 max-w-2xl text-graphite">
            Cloudflare Workers backend with a daily Cron Trigger. Each cycle
            cut-off (23:00 UTC), the worker queries D1 for ready commissions,
            re-checks Position.status on chain, and submits a batched
            settlement instruction signed by the registered oracle key.
          </p>
        </div>
        <span
          className={`pill ${
            health?.ok ? "border-cnx-olive/40 bg-cnx-olive/10 text-cnx-olive" : "border-cnx-rose/40 bg-cnx-rose/10 text-cnx-rose"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${health?.ok ? "bg-cnx-olive animate-pulse-soft" : "bg-cnx-rose"}`} />
          {health?.ok ? "operator healthy" : "operator unreachable"}
        </span>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Network ID" value={process.env.NEXT_PUBLIC_NETWORK_ID ?? "1"} />
        <StatTile label="Cycle" value={network ? network.cycleIndex.toString() : "…"} />
        <StatTile label="Members" value={network ? network.memberCount.toString() : "…"} />
        <StatTile label="Cluster" value={health?.cluster ?? "devnet"} sub={health?.time ? new Date(health.time).toLocaleTimeString() : undefined} />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <article className="card lg:col-span-2 flex flex-col gap-3">
          <h2 className="font-display text-2xl text-ink">Manual settlement run</h2>
          <p className="text-sm text-graphite">
            Triggers <code className="font-mono text-xs">POST /settle/run</code>.
            The worker scans for pending_commission rows whose settle_at is in
            the past, marks them settled, records a settlement row in D1, and
            (in production) submits the on-chain payout via the oracle.
          </p>
          <button
            onClick={triggerRun}
            disabled={running}
            className="self-start rounded-full bg-ink px-6 py-3 text-sm font-medium text-cream transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            {running ? "Running…" : "Trigger cycle now"}
          </button>
          {message && <p className="font-mono text-xs text-graphite">{message}</p>}
        </article>

        <article className="card flex flex-col gap-3">
          <h2 className="font-display text-xl text-ink">Authority</h2>
          <div className="flex items-center justify-between text-sm">
            <span className="text-stone">admin</span>
            {network && <PubkeyChip value={network.admin} />}
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-stone">oracle</span>
            {network && <PubkeyChip value={network.oracle} />}
          </div>
          <p className="text-xs text-stone">
            Oracle is the only signer the network program accepts for
            place_member, record_purchase, and add_earnings.
          </p>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <h2 className="font-display text-2xl text-ink">Settlement runs</h2>
          {settlements.length === 0 ? (
            <p className="card text-sm text-stone">No settlement runs yet — trigger one above.</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-edge bg-paper">
              <table className="w-full text-sm">
                <thead className="bg-cream text-left text-[10px] uppercase tracking-[0.18em] text-stone">
                  <tr>
                    <th className="px-5 py-3">When</th>
                    <th className="px-3 py-3">Cycle</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3 text-right">Items</th>
                    <th className="px-3 py-3">ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {settlements.map((s) => (
                    <tr key={s.id} className="hover:bg-cream/60">
                      <td className="px-5 py-3 text-xs text-graphite">
                        {new Date(s.submitted_at * 1000).toLocaleString()}
                        <span className="ml-2 text-stone">({relativeTime(s.submitted_at)})</span>
                      </td>
                      <td className="num px-3 py-3 font-mono text-xs">{s.cycle_index}</td>
                      <td className="px-3 py-3 text-xs">
                        <span className={s.status === "settled" ? "text-cnx-olive" : "text-cnx-amber"}>
                          {s.status}
                        </span>
                      </td>
                      <td className="num px-3 py-3 text-right font-mono text-xs">{s.total_paid}</td>
                      <td className="px-3 py-3 font-mono text-[10px] text-stone">{s.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <TxFeed limit={6} />
      </section>
    </div>
  );
}
