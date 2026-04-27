import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Providers from "./providers";
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
  title: "SLB Fork Monitor",
  description: "SLB internal repository fork monitoring workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          <div className="slb-shell">
            <header className="slb-masthead">
              <div className="slb-masthead__inner">
                <div className="slb-brand">
                  <span className="slb-eyebrow">SLB Internal Tool Suite</span>
                  <span className="slb-brand__title">Fork Monitor</span>
                </div>
                <div className="slb-meta">
                  <span>Project 3</span>
                  <span className="slb-meta__divider" />
                  <span>Repository Governance</span>
                </div>
              </div>
            </header>
            <div className="slb-subnav">
              <div className="slb-subnav__inner">
                <span>Repository inventory</span>
                <span className="arrow">-&gt;</span>
                <span>Project scanning</span>
                <span className="arrow">-&gt;</span>
                <span>Fork comparison detail</span>
              </div>
            </div>
            <div className="slb-shell__body">{children}</div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
