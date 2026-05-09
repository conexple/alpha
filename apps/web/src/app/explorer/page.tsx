"use client";

import { useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  PROGRAM_NETWORK,
  NETWORK_ID,
  connection,
  readNetwork,
  type NetworkView,
} from "@/lib/program-clients";

interface PositionRow {
  pubkey: string;
  wallet: string;
  parent: string | null;
  depth: number;
  status: "active" | "expired";
  joinedAt: bigint;
}

export default function ExplorerPage() {
  const [network, setNetwork] = useState<NetworkView | null>(null);
  const [rows, setRows] = useState<PositionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const net = await readNetwork();
        if (cancelled) return;
        setNetwork(net);
        const positions = await fetchAllPositions();
        if (!cancelled) {
          setRows(positions);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold">Network explorer</h1>
        {network && (
          <span className="text-sm text-white/60">
            cycle <strong>{network.cycleIndex.toString()}</strong> · members{" "}
            <strong>{network.memberCount.toString()}</strong>
          </span>
        )}
      </header>

      {error && <p className="text-cnx-err">{error}</p>}
      {loading && <p className="text-white/60">Scanning chain…</p>}

      {!loading && rows.length === 0 && (
        <p className="text-white/60">
          No positions found in this network yet. Run{" "}
          <code className="rounded bg-white/10 px-1">pnpm seed</code> on devnet.
        </p>
      )}

      {!loading && rows.length > 0 && (
        <table className="w-full overflow-hidden rounded-xl border border-white/10 text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase text-white/50">
            <tr>
              <th className="px-3 py-2">Wallet</th>
              <th className="px-3 py-2">Parent</th>
              <th className="px-3 py-2">Depth</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.pubkey} className="border-t border-white/10">
                <td className="px-3 py-2 font-mono text-xs">{shorten(r.wallet)}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.parent ? shorten(r.parent) : "—"}</td>
                <td className="px-3 py-2">{r.depth}</td>
                <td className={`px-3 py-2 ${r.status === "active" ? "text-cnx-accent2" : "text-cnx-warn"}`}>
                  {r.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function shorten(s: string) {
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

async function fetchAllPositions(): Promise<PositionRow[]> {
  const conn = connection();
  // Anchor account discriminator for `Position` is the first 8 bytes of
  // sha256("account:Position"). To avoid hashing client-side, we just
  // gPA the program owner and decode each one — V1 acceptable.
  const accounts = await conn.getProgramAccounts(PROGRAM_NETWORK, {
    commitment: "confirmed",
    filters: [
      { dataSize: 1 + 8 + 32 + (1 + 32) + 1 + 1 + 8 + 8 + 8 + 1 + 8 + (1 + 8) + 64 + 8 },
    ],
  });
  const out: PositionRow[] = [];
  for (const acc of accounts) {
    const data = acc.account.data;
    let cur = 8;
    cur += 1; // bump
    cur += 8; // network_id
    const wallet = new PublicKey(data.subarray(cur, cur + 32)); cur += 32;
    const parentTag = data.readUInt8(cur); cur += 1;
    let parent: string | null = null;
    if (parentTag === 1) {
      parent = new PublicKey(data.subarray(cur, cur + 32)).toBase58();
      cur += 32;
    }
    const depth = data.readUInt8(cur); cur += 1;
    const statusByte = data.readUInt8(cur); cur += 1;
    const status: "active" | "expired" = statusByte === 0 ? "active" : "expired";
    cur += 8 + 8 + 8 + 1; // cumulativeEarned, earningsCap, lastPurchaseRound, extension_locked
    const joinedAt = data.readBigInt64LE(cur);
    out.push({
      pubkey: acc.pubkey.toBase58(),
      wallet: wallet.toBase58(),
      parent,
      depth,
      status,
      joinedAt,
    });
  }
  out.sort((a, b) => Number(a.joinedAt - b.joinedAt));
  return out;
}
