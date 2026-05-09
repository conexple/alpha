"use client";

import { useEffect, useState } from "react";
import { readNetwork, type NetworkView } from "@/lib/program-clients";

const OPERATOR_API =
  process.env.NEXT_PUBLIC_OPERATOR_URL ?? "https://conexple-worker-operator.workers.dev";

interface SettlementRow {
  id: string;
  cycle_index: number;
  submitted_at: number;
  total_paid: number;
  status: string;
}

export default function OperatorPage() {
  const [network, setNetwork] = useState<NetworkView | null>(null);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    readNetwork().then(setNetwork);
    refresh();
  }, []);

  async function refresh() {
    try {
      const r = await fetch(`${OPERATOR_API}/settle/status`);
      const j: SettlementRow[] = await r.json();
      setSettlements(j);
    } catch (e) {
      console.warn("operator API unreachable", e);
    }
  }

  async function triggerRun() {
    setRunning(true);
    setMessage(null);
    try {
      const r = await fetch(`${OPERATOR_API}/settle/run`, { method: "POST" });
      const j = await r.json();
      setMessage(`Run submitted: ${JSON.stringify(j)}`);
      await refresh();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold">Operator dashboard</h1>
        <p className="text-white/60">Cycle scheduler + settlement audit · devnet</p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Stat label="Network ID" value={process.env.NEXT_PUBLIC_NETWORK_ID ?? "1"} />
        <Stat label="Current cycle" value={network ? network.cycleIndex.toString() : "—"} />
        <Stat label="Members" value={network ? network.memberCount.toString() : "—"} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Settlement runs</h2>
          <button
            onClick={triggerRun}
            disabled={running}
            className="rounded-lg bg-gradient-to-r from-cnx-accent to-cnx-accent2 px-4 py-2 font-semibold text-cnx-ink disabled:opacity-50"
          >
            {running ? "Running…" : "Trigger cycle now"}
          </button>
        </div>
        {message && <p className="text-sm text-white/70">{message}</p>}
        {settlements.length === 0 ? (
          <p className="text-white/60">No settlement runs yet.</p>
        ) : (
          <table className="w-full overflow-hidden rounded-xl border border-white/10 text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase text-white/50">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Cycle</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Items</th>
                <th className="px-3 py-2">ID</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((s) => (
                <tr key={s.id} className="border-t border-white/10">
                  <td className="px-3 py-2 text-xs">
                    {new Date(s.submitted_at * 1000).toISOString()}
                  </td>
                  <td className="px-3 py-2">{s.cycle_index}</td>
                  <td className="px-3 py-2">{s.status}</td>
                  <td className="px-3 py-2">{s.total_paid}</td>
                  <td className="px-3 py-2 font-mono text-xs">{s.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs text-white/50">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
