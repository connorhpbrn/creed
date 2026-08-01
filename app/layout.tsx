import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
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

// Strict nonce-based CSP requires request-time rendering so Next can attach the
// current request's nonce to every framework and streaming script.
export const dynamic = "force-dynamic";

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
        <ThemeProvider>
          {children}
          <Toaster />
          <WelcomeDevPreview />
        </ThemeProvider>
      </body>
    </html>
  );
}
