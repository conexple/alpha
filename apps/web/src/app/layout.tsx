import type { Metadata } from "next";
import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import { WalletProviders } from "@/components/WalletProviders";
import { TopNav } from "@/components/TopNav";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Conexple — Open consumer affiliate protocol on Solana",
  description:
    "Redirect existing merchant marketing commissions to everyday consumers — 5-level unilevel + Infinity Override on Solana, on-chain rules, anti-MLM by structural design.",
  metadataBase: new URL("https://conexple-worker-web.sornwin.workers.dev"),
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: "Conexple — Pay loyal customers, not influencers.",
    description:
      "Open-source consumer affiliate protocol on Solana. Every rule, payout, and position lives on chain.",
    type: "website",
    url: "https://conexple-worker-web.sornwin.workers.dev",
    siteName: "Conexple",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Conexple — pay loyal customers, not influencers. 5-level unilevel + Infinity Override on Solana.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Conexple — Pay loyal customers, not influencers.",
    description:
      "Open-source consumer affiliate protocol on Solana. Every rule, payout, and position on chain.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProviders>
          <TopNav />
          <main className="container-page py-10 sm:py-16">{children}</main>
          <SiteFooter />
        </WalletProviders>
      </body>
    </html>
  );
}
