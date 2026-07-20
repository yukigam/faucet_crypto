import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AdsterraPopunder from "@/components/AdsterraPopunder";
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
        <AdsterraPopunder />
      </body>
    </html>
  );
}
