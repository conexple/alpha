"use client";

import { useEffect, useState } from "react";
import { StatTile } from "@/components/StatTile";

const OPERATOR_API =
  process.env.NEXT_PUBLIC_OPERATOR_URL ?? "https://conexple-worker-operator.sornwin.workers.dev";

interface Merchant {
  id: string;
  name: string;
  marginBps: number;
  pda: string;
  vaultBalance?: string; // base units, USDC = 6 decimals
}

// Fallback catalog if /merchant/list is unreachable (e.g. local dev without
// the operator running). Each entry mirrors a MerchantEscrow PDA already
// initialized on devnet via scripts/init-merchant.ts.
const FALLBACK_MERCHANTS: Merchant[] = [
  { id: "1", name: "Demo Merchant 01", marginBps: 5000, pda: "—" },
  { id: "2", name: "Demo Merchant 02", marginBps: 4500, pda: "HwrBWSzM8gDddmsUKob9cLMAgdhuTwVxUbhnvFJFe6Us" },
  { id: "3", name: "Demo Merchant 03", marginBps: 3000, pda: "GRaZoLpY5VZZ91YEre4TjtjpkvhfKuU69fxUMVke8d7a" },
];

interface OperatorListItem {
  merchant_id: string;
  name: string;
  margin_bps: number;
  pda: string;
  vault_balance_base_units: string;
}

function formatUsdc(baseUnits?: string): string | undefined {
  if (!baseUnits) return undefined;
  const n = Number(baseUnits) / 1_000_000;
  if (!Number.isFinite(n)) return undefined; // operator may send "?" in degraded mode
  return `${n.toFixed(2)} USDC`;
}

function hasPda(pda: string): boolean {
  return Boolean(pda) && pda !== "—";
}

export default function MerchantPage() {
  const [merchants, setMerchants] = useState<Merchant[]>(FALLBACK_MERCHANTS);
  const [merchantId, setMerchantId] = useState("1");
  const [purchaseId, setPurchaseId] = useState("");
  const [resp, setResp] = useState<string | null>(null);
  const [busy, setBusy] = useState<"void" | "force" | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${OPERATOR_API}/merchant/list`, { method: "GET" });
        if (!r.ok) return;
        const data = (await r.json()) as { merchants?: OperatorListItem[] };
        if (cancelled || !data.merchants?.length) return;
        const fromChain: Merchant[] = data.merchants.map((m) => ({
          id: m.merchant_id,
          name: m.name,
          marginBps: m.margin_bps,
          pda: m.pda,
          vaultBalance: m.vault_balance_base_units,
        }));
        // Merge: union of fallback + on-chain, on-chain wins on collisions.
        const byId = new Map<string, Merchant>();
        for (const m of FALLBACK_MERCHANTS) byId.set(m.id, m);
        for (const m of fromChain) byId.set(m.id, m);
        const merged = Array.from(byId.values()).sort(
          (a, b) => Number(BigInt(a.id) - BigInt(b.id)),
        );
        setMerchants(merged);
      } catch {
        // Silent — keep fallback list.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = merchants.find((m) => m.id === merchantId) ?? merchants[0]!;

  async function trigger(action: "void" | "force-expire") {
    setBusy(action === "void" ? "void" : "force");
    setResp(null);
    try {
      const r = await fetch(`${OPERATOR_API}/merchant/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ merchant_id: merchantId, purchase_id: purchaseId, wallet: purchaseId }),
      });
      setResp(JSON.stringify(await r.json(), null, 2));
    } catch (e) {
      setResp(String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-12">
      <header>
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone">Merchant ops</span>
        <h1 className="mt-1 font-display text-4xl text-ink sm:text-5xl">
          Merchant console
        </h1>
        <p className="mt-3 max-w-2xl text-graphite">
          Demo controls. The protocol is multi-merchant — switch between {merchants.length} merchants below.
          Void cancels a pending commission within the 30-day refund window.
          Force-expire is the operator's escape hatch when a customer is
          gaming the system (auto-fires after 3 voids in 3 rounds).
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Merchant ID" value={selected.id} sub={selected.name} />
        <StatTile label="Margin (bps)" value={String(selected.marginBps)} sub={`${(selected.marginBps / 100).toFixed(1)}%`} />
        <StatTile
          label="Vault balance"
          value={formatUsdc(selected.vaultBalance) ?? "—"}
          sub={hasPda(selected.pda) ? `${selected.pda.slice(0, 4)}…${selected.pda.slice(-4)}` : "off-chain only"}
          emphasis="purple"
        />
        <StatTile label="Mock USDC" value="6 dec" sub="DMVS…1rNG" emphasis="amber" />
      </section>

      <section className="card max-w-2xl space-y-5">
        <h2 className="font-display text-2xl text-ink">Manage a pending purchase</h2>
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone">Merchant</span>
          <select
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-edge bg-cream px-4 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
          >
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                #{m.id} — {m.name} ({(m.marginBps / 100).toFixed(1)}% margin)
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-stone">
            Numeric ID assigned at <code className="font-mono">initialize_merchant</code> time.
            {hasPda(selected.pda) && (
              <>
                {" "}MerchantEscrow PDA: <code className="font-mono">{selected.pda.slice(0, 6)}…{selected.pda.slice(-4)}</code>.
              </>
            )}
          </span>
        </label>
        <Field
          label="Purchase / wallet identifier"
          value={purchaseId}
          onChange={setPurchaseId}
          hint="Use a correlation_id for void; a wallet pubkey for force-expire"
          mono
        />
        <div className="flex flex-wrap gap-3 pt-2">
          <button
            onClick={() => trigger("void")}
            disabled={busy !== null || !purchaseId}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-cream transition-transform hover:-translate-y-0.5 disabled:opacity-40"
          >
            {busy === "void" ? "Voiding…" : "Void purchase"}
          </button>
          <button
            onClick={() => trigger("force-expire")}
            disabled={busy !== null || !purchaseId}
            className="rounded-full border border-cnx-rose/50 bg-cnx-rose/10 px-5 py-2.5 text-sm font-medium text-cnx-rose transition-colors hover:border-cnx-rose disabled:opacity-40"
          >
            {busy === "force" ? "Expiring…" : "Force expire position"}
          </button>
        </div>
        {resp && (
          <pre className="overflow-x-auto rounded-xl border border-edge bg-cream p-4 font-mono text-xs">
            {resp}
          </pre>
        )}
      </section>

      <section className="rounded-2xl border border-cnx-amber/30 bg-cnx-amber/5 p-6 text-sm text-graphite">
        <h3 className="font-display text-lg text-ink">⚠ Demo notes</h3>
        <ul className="mt-2 space-y-1.5 list-disc pl-6">
          <li>
            For V1 these actions update the operator's D1 mirror. In a
            production deployment, the same calls would also CPI the
            on-chain <code className="font-mono">conexple_escrow::void_purchase</code> and{" "}
            <code className="font-mono">conexple_network::force_expire</code>.
          </li>
          <li>
            <strong>{`Auto-threshold:`}</strong> 3 voids in 3 rounds → automatic
            force_expire. The operator can also do it manually here.
          </li>
          <li>
            <strong>Past settle:</strong> void is rejected after{" "}
            <code className="font-mono">block.timestamp ≥ settle_at</code> — once
            commission has flown to the upline ATA, only off-chain dispute
            remains.
          </li>
        </ul>
      </section>
    </div>
  );
}

function Field({
  label, value, onChange, hint, mono,
}: {
  label: string; value: string; onChange: (s: string) => void;
  hint?: string; mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1.5 w-full rounded-lg border border-edge bg-cream px-4 py-2.5 text-sm text-ink focus:border-ink focus:outline-none ${mono ? "font-mono text-xs" : ""}`}
      />
      {hint && <span className="mt-1 block text-xs text-stone">{hint}</span>}
    </label>
  );
}
