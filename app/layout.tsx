import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { CreedBootSplash } from "@/components/creed/creed-boot-splash";
import { ThemeProvider } from "@/components/creed/theme-provider";
import { WelcomeDevPreview } from "@/components/creed/welcome-dev-preview";
import { CREED_DESCRIPTION, CREED_META_TITLE } from "@/lib/marketing/brand";
import { getSiteUrl } from "@/lib/supabase/env";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Share-card / search-result imagery, all via Next's filesystem convention:
// - `app/opengraph-image.jpg` is wired into `<meta property="og:image">`.
// - `app/twitter-image.jpg` is wired into `<meta name="twitter:image">`.
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
  },
  twitter: {
    card: "summary_large_image",
    title: CREED_META_TITLE,
    description: CREED_DESCRIPTION,
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
        {/* Painted with the first bytes of the shell when /theme-init.js marks a
            fresh document load of the editor, and taken away by CSS the moment
            the editor's own markup arrives in the stream. Inert everywhere else
            (see `creed-boot-splash` in globals.css). */}
        <CreedBootSplash />
        <ThemeProvider>
          {children}
          <Toaster />
          <WelcomeDevPreview />
        </ThemeProvider>
      </body>
    </html>
  );
}
