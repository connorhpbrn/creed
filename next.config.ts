import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const distDir =
  process.env.CREED_DIST_DIR ||
  (isDev ? ".next-runtime.nosync" : undefined);

const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const securityHeaders = baseSecurityHeaders;

// Routes whose HTML depends on the active user. We pin them to `private,
// no-store` so a CDN / browser back-cache can never serve one user the
// previous user's rendered page after sign-out or account switching on a
// shared device.
const NO_STORE_PATHS = [
  "/",
  "/file/:path*",
  "/onboarding/:path*",
  "/connections/:path*",
  "/settings/:path*",
  "/payment/success/:path*",
];

const noStoreHeader = {
  key: "Cache-Control",
  value: "private, no-store",
};

const withBundleAnalyzer = process.env.ANALYZE === "true"
  ? // Loaded only when ANALYZE=true so the dep doesn't run on normal builds
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@next/bundle-analyzer")({ enabled: true })
  : (config: NextConfig) => config;

const nextConfig: NextConfig = {
  // Keep the constantly changing dev cache out of iCloud Drive. macOS excludes
  // directories ending in `.nosync`, which prevents Desktop-hosted checkouts
  // from making fileproviderd index every Turbopack write. CREED_DIST_DIR lets
  // preview servers and local verification builds use their own isolated cache.
  ...(distDir ? { distDir } : {}),
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    // Next 16 requires explicit allow-listing of any custom quality used via
    // <Image quality={X} />. Leaving 75 as the default and adding 100 for
    // the high-res landing backgrounds.
    qualities: [75, 100],
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  async redirects() {
    return [
      {
        source: "/context",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/learn/:path*",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/examples",
        destination: "/home",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Static brand assets (hero / auth backgrounds, etc.) are versioned by
        // filename and never change in place, so cache them hard. This is what
        // makes the landing backgrounds paint instantly on repeat visits
        // instead of refetching every time. Applies in dev too.
        source: "/assets/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      ...NO_STORE_PATHS.map((source) => ({
        source,
        headers: [noStoreHeader],
      })),
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
