import type { Metadata } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { BackendSetupScreen } from "@/components/auth/backend-setup-screen";
import { CreedProvider } from "@/components/creed/creed-provider";
import { ThemeProvider } from "@/components/creed/theme-provider";
import { initialCreedState } from "@/lib/creed-data";
import { loadCreedState } from "@/lib/creed-backend";
import { isSupabaseTableMissingError } from "@/lib/creed-backend-errors";
import { getSiteUrl, isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

// Marketing / static routes that don't read user state. Skipping the
// Supabase fan-out for these makes them render in tens of ms instead of
// hundreds-to-seconds while we wait on 9 round-trips that nothing on the
// page would have used anyway.
const MARKETING_PREFIXES = [
  "/home",
  "/docs",
  "/pricing",
  "/privacy",
  "/terms",
  "/stack",
  "/mcp",
];

function shouldSkipCreedState(pathname: string | null) {
  if (!pathname) return false;
  return MARKETING_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const gambarino = localFont({
  variable: "--font-gambarino",
  display: "swap",
  src: [
    {
      path: "./fonts/Gambarino-Regular.otf",
      weight: "400",
      style: "normal",
    },
  ],
});

// Share-card / search-result imagery.
//
// - `/search-preview.png` (public/) is what Google's rich results, Slack,
//   iMessage, LinkedIn, and Facebook fetch for the link preview.
// - `app/twitter-image.png` is picked up by Next's filesystem convention
//   and wired into `<meta name="twitter:image">` automatically — we
//   don't need to reference it here.
// - `app/favicon.ico` stays the browser-tab favicon via Next's
//   filesystem convention. We pin it explicitly under `icons.icon` so a
//   future `app/icon.png` doesn't silently take over and the search-
//   result favicon Google reads stays the same one users see in tabs.
const SITE_DESCRIPTION =
  "The canonical markdown file for your personal context.";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Creed",
  description: SITE_DESCRIPTION,
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    type: "website",
    siteName: "Creed",
    title: "Creed",
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/search-preview.png",
        width: 1000,
        height: 1000,
        alt: "Creed. A universal AI context file.",
      },
    ],
  },
};

// Force every request through SSR. Without this, Vercel's build pass can
// statically render this layout once (with no user, no cookies, no
// pathname), then reuse the output for every visitor — so the imported
// `initialCreedState` ends up baked into the static shell and signed-in
// users see seed sections + an empty name in the header. `headers()`
// and `cookies()` reads below *should* mark this dynamic on their own,
// but Next 16 has been inconsistent about that; this is the belt-and-
// braces guarantee.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  let initialState = initialCreedState;
  let persistenceEnabled = false;
  let missingSchemaMessage: string | null = null;

  const headerList = await headers();
  const pathname = headerList.get("x-pathname");
  const skipState = shouldSkipCreedState(pathname);

  if (!skipState && isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      try {
        const result = await loadCreedState(supabase, user);
        initialState = result.state;
        persistenceEnabled = result.hasPersistedCreed;
      } catch (error) {
        if (isSupabaseTableMissingError(error)) {
          missingSchemaMessage =
            error instanceof Error ? error.message : "Creed tables are missing.";
        } else {
          throw error;
        }
      }
    }
  }

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${gambarino.variable} h-full antialiased`}
    >
      <head>
        {/* Apply persisted theme before paint so dark mode doesn't flash.
            This is a server-rendered inline script — runs once during the
            initial HTML response, before React hydrates, so the dark-mode
            class is on <html> by the time anything else paints.
            `next/script` with strategy="beforeInteractive" was causing the
            page to hang in Next 16 dev. Inline <script> in <head> is the
            canonical no-flash pattern and works without ceremony. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('creed:theme');if(t==='dark'){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {missingSchemaMessage ? (
            <BackendSetupScreen errorMessage={missingSchemaMessage} />
          ) : (
            <CreedProvider initialState={initialState} persistenceEnabled={persistenceEnabled}>
              {children}
            </CreedProvider>
          )}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
