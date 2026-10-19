import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/shell/app-shell";
import { Logo } from "@/components/logo";
import { PageSkeleton } from "@/components/ui";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "DataOrbyt", template: "%s · DataOrbyt" },
  description: "Founder analytics: connect product and revenue data, get a trusted dashboard, share it the same day.",
};

function ShellFallback() {
  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 border-r border-line bg-[#fbfbfc] lg:block">
        <div className="flex h-14 items-center border-b border-line px-4">
          <Logo />
        </div>
      </aside>
      <div className="flex-1">
        <div className="h-14 border-b border-line bg-surface" />
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
          <PageSkeleton />
        </div>
      </div>
    </div>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop">
          Skip to content
        </a>
        <Suspense fallback={<ShellFallback />}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
