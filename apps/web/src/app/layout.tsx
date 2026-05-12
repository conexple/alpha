import type { Metadata } from "next";
import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import { WalletProviders } from "@/components/WalletProviders";
import { TopNav } from "@/components/TopNav";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Conexple — Open consumer affiliate protocol on Solana",
  description:
    "Open consumer-affiliate protocol on Solana. The merchant's commission redirects to loyal customers who actually buy — a step toward basic income from consumption. 50% margin cap, purchase-gated, rotation by expiry, Apache 2.0.",
  metadataBase: new URL("https://alpha.conexple.com"),
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "256x256" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
  },
  openGraph: {
    title: "Conexple — Income from what you buy.",
    description:
      "Open consumer-affiliate protocol on Solana. Every rule, payout, and position lives on chain — and every position rotates.",
    type: "website",
    url: "https://alpha.conexple.com",
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
    title: "Conexple — Income from what you buy.",
    description:
      "Open consumer-affiliate protocol on Solana. Every rule, payout, and position lives on chain — and every position rotates.",
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
