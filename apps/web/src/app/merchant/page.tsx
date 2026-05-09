"use client";

import { useState } from "react";

const OPERATOR_API =
  process.env.NEXT_PUBLIC_OPERATOR_URL ?? "https://conexple-worker-operator.workers.dev";

export default function MerchantPage() {
  const [merchantId, setMerchantId] = useState("1");
  const [purchaseId, setPurchaseId] = useState("");
  const [resp, setResp] = useState<string | null>(null);

  async function trigger(action: "void" | "force-expire") {
    setResp(null);
    try {
      const r = await fetch(`${OPERATOR_API}/merchant/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ merchant_id: merchantId, purchase_id: purchaseId }),
      });
      setResp(await r.text());
    } catch (e) {
      setResp(String(e));
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold">Merchant view</h1>
        <p className="text-white/60">
          Devnet demo — manage your escrow + dispute pending purchases.
        </p>
      </header>

      <div className="rounded-2xl border border-cnx-warn/30 bg-cnx-warn/5 p-4 text-sm text-cnx-warn">
        These actions hit the operator API. In a real merchant integration the
        merchant signs locally; for the V1 demo the operator relays signed
        instructions from a per-merchant authority key. See HANDOFF.md.
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <Field label="Merchant ID" value={merchantId} onChange={setMerchantId} />
        <Field
          label="Purchase ID (correlation_id)"
          value={purchaseId}
          onChange={setPurchaseId}
        />
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => trigger("void")}
          className="rounded-lg border border-white/20 px-4 py-2"
        >
          Void purchase
        </button>
        <button
          onClick={() => trigger("force-expire")}
          className="rounded-lg border border-cnx-warn/40 bg-cnx-warn/10 px-4 py-2 text-cnx-warn"
        >
          Force expire position
        </button>
      </div>

      {resp && (
        <pre className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-4 text-xs">
          {resp}
        </pre>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) {
  return (
    <label className="block">
      <span className="block text-xs text-white/60">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm"
      />
    </label>
  );
}
