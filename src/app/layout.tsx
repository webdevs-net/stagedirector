import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { RunsProvider } from "@/components/runs/RunsProvider";
import { RunWindow } from "@/components/runs/RunWindow";

const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["400", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Stage Director",
  description: "Move code from local to staging to live, safely.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${nunito.variable} font-sans antialiased`}>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 rounded-xl bg-white px-4 py-3 font-bold">
          Skip to content
        </a>
        <RunsProvider>
          <main id="main" className="min-h-screen px-4 pt-8 pb-48 sm:px-6 sm:py-10">{children}</main>
          <RunWindow />
        </RunsProvider>
      </body>
    </html>
  );
}
