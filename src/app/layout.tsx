import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
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
  title: "Crypto Faucet",
  description: "Claim free crypto coins every 5 minutes",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="bg-gray-950 text-white min-h-screen">
        {children}
        <Script
          src="//pl30445321.effectivecpmnetwork.com/89/cb/2d/89cb2d8768fb0d2017d6d4ef194465a0.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
