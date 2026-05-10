export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-edge">
      <div className="container-page py-12">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-xl text-ink">conexple</span>
              <span className="h-1.5 w-1.5 rounded-full bg-cnx-amber" />
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-graphite">
              Open consumer affiliate protocol on Solana. Built by Sornkan in
              Bangkok 🇹🇭 for the Colosseum Frontier 2026 hackathon.
            </p>
          </div>
          <FooterCol
            title="Product"
            links={[
              { href: "/dashboard", label: "Dashboard" },
              { href: "/explorer", label: "Network" },
              { href: "/operator", label: "Operator" },
              { href: "/merchant", label: "Merchant" },
              { href: "/simulator", label: "Simulator" },
            ]}
          />
          <FooterCol
            title="Protocol"
            links={[
              { href: "https://github.com/conexple/alpha", label: "GitHub", ext: true },
              { href: "https://github.com/conexple/alpha/blob/main/docs/mechanics.md", label: "Mechanics spec", ext: true },
              { href: "https://github.com/conexple/alpha/blob/main/docs/payout.md", label: "Payout timing", ext: true },
              { href: "https://github.com/conexple/alpha/blob/main/docs/architecture.md", label: "Architecture", ext: true },
            ]}
          />
          <FooterCol
            title="Status"
            links={[
              { href: "https://solscan.io/account/D1HVppRLhT6wmUxmaM4QABytmcBDEmKuuuMoa7HkKSbn?cluster=devnet", label: "Protocol on devnet", ext: true },
              { href: "https://conexple-worker-operator.sornwin.workers.dev/health", label: "Operator health", ext: true },
            ]}
          />
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-edge pt-6 text-xs text-stone sm:flex-row sm:items-center">
          <span>
            © 2026 Sornkan Co., Ltd. — released under{" "}
            <a className="underline-offset-4 hover:underline" href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noreferrer">
              Apache 2.0
            </a>
            .
          </span>
          <span className="font-mono uppercase tracking-[0.18em]">
            devnet · alpha · unaudited · do not use real funds
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string; ext?: boolean }[];
}) {
  return (
    <div>
      <h4 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone">
        {title}
      </h4>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <a
              href={l.href}
              {...(l.ext ? { target: "_blank", rel: "noreferrer" } : {})}
              className="text-graphite transition-colors hover:text-ink"
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
