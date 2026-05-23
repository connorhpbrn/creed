import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// CSP — kept reasonable: blocks framing + restricts script origins. Inline
// styles are allowed because Tailwind v4 + framer-motion both set them. To
// tighten further, move to nonce-based scripts via middleware.
const csp = [
  "default-src 'self'",
  // Scripts: same-origin + Next runtime needs eval in dev; loosen to unsafe-inline so we don't break inline boot
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""} https://*.supabase.co https://js.stripe.com https://checkout.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://*.supabase.in https://api.openrouter.ai https://openrouter.ai https://api.github.com https://api.stripe.com https://checkout.stripe.com",
  // Stripe Checkout embeds an iframe back to checkout.stripe.com on the
  // redirect-based flow's intermediate states (3DS, etc.) — `frame-src`
  // needs to allow it.
  "frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://hooks.stripe.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
]
  .filter(Boolean)
  .join("; ");

const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

// Run CSP in Report-Only first so we can verify nothing breaks before enforcing.
// Flip to "Content-Security-Policy" when you've watched the console for a release cycle.
const cspHeader = process.env.CREED_CSP_ENFORCE === "1"
  ? { key: "Content-Security-Policy", value: csp }
  : { key: "Content-Security-Policy-Report-Only", value: csp };

const securityHeaders = [...baseSecurityHeaders, cspHeader];

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
  ...(process.env.NODE_ENV === "development" ? { distDir: ".next-runtime" } : {}),
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
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      ...NO_STORE_PATHS.map((source) => ({
        source,
        headers: [noStoreHeader],
      })),
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
