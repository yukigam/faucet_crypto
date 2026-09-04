import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AdsterraPopunder from "@/components/AdsterraPopunder";
import { AdBlockProvider } from "@/contexts/AdBlockContext";
import { PopunderProvider } from "@/contexts/PopunderContext";
import BlockerWarning from "@/components/BlockerWarning";
import SiteFooter from "@/components/SiteFooter";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://faucet-crypto.vercel.app"),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "Claim free crypto every 5 minutes with instant FaucetPay payouts. Earn more with paid-to-click ads, shortlinks and a referral program.",
  keywords: [
    "crypto faucet",
    "free crypto",
    "FaucetPay",
    "PTC ads",
    "shortlinks",
    "bitcoin faucet",
    "referral rewards",
  ],
  openGraph: {
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description:
      "Claim free crypto every 5 minutes with instant FaucetPay payouts. Earn more with PTC ads, shortlinks and referrals.",
    type: "website",
    siteName: SITE_NAME,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="bg-gray-950 text-white min-h-screen flex flex-col">
        <AdBlockProvider>
          <PopunderProvider>
            <div className="flex flex-1 flex-col">{children}</div>
            <SiteFooter />
            <BlockerWarning />
            <AdsterraPopunder />
          </PopunderProvider>
        </AdBlockProvider>
      </body>
    </html>
  );
}
