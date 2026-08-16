import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/creed/theme-provider";
import { EditionProvider } from "@/components/creed/edition-provider";
import { EditionDevPreview } from "@creed/edition/ui";
import { CREED_DESCRIPTION, CREED_META_TITLE } from "@/lib/marketing/brand";
import { getSiteUrl } from "@creed/persistence/supabase/env";
import { Toaster } from "@creed/ui/toaster";
import { edition } from "@creed/edition/config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Open Graph and Twitter share one public image so both editions emit the
// same social preview without duplicating binary assets in their route trees.
// - `app/favicon.ico` stays the browser-tab favicon. We pin it explicitly
//   under `icons.icon` so a future `app/icon.png` doesn't silently take over
//   and the search-result favicon Google reads stays the one users see in tabs.
// `title.default` is the brand title used by any page that doesn't set its
// own (the root redirect and /home both fall back to it). `title.template`
// suffixes per-page titles, so individual pages set a bare title ("Pricing")
// and get "Pricing | Creed" automatically. A page that wants an exact title
// uses `title: { absolute: "..." }`.
export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: CREED_META_TITLE,
    template: "%s | Creed",
  },
  description: CREED_DESCRIPTION,
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    type: "website",
    siteName: "Creed",
    title: CREED_META_TITLE,
    description: CREED_DESCRIPTION,
    images: ["/opengraph.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: CREED_META_TITLE,
    description: CREED_DESCRIPTION,
    images: ["/opengraph.png"],
  },
};

// No `dynamic` export here on purpose. The strict nonce CSP does need
// request-time rendering, but forcing it at the root applied that cost to every
// route in the app: marketing pages lost static generation, CDN caching,
// <Link> prefetch and ISR, and their unnonced JSON-LD scripts were blocked. The
// nonce policy is scoped to the already-dynamic app and credential routes
// instead - see lib/csp-policy.ts.
//
// The root layout is intentionally static: it holds no user state, reads no
// cookies/headers, and renders no CreedProvider. User-specific work
// (Supabase session, loadCreedState, CreedProvider) lives in <AuthedProviders>,
// pulled in only by the layouts that need it (the app shell and onboarding).
export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* A same-origin external script keeps the no-flash theme boot while
            allowing production CSP to reject every inline script. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-init.js" />
      </head>
      <body className="min-h-full flex flex-col">
        <EditionProvider edition={edition}>
          <ThemeProvider>
            {children}
            <Toaster />
            <EditionDevPreview />
          </ThemeProvider>
        </EditionProvider>
      </body>
    </html>
  );
}
