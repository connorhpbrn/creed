"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to Vercel logs so we can see what actually threw in prod.
    console.error("[global-error]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: "#f9f9f8",
          color: "#1f1f1a",
          minHeight: "100vh",
          margin: 0,
          padding: "4rem 1.5rem",
        }}
      >
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>
            Something went wrong loading this page.
          </h1>
          <p style={{ marginTop: 16, color: "#636360", lineHeight: 1.6 }}>
            This is a temporary error. Try reloading; if it persists, the digest
            below will help us track it down.
          </p>
          {error.digest ? (
            <code
              style={{
                display: "inline-block",
                marginTop: 24,
                padding: "6px 10px",
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                fontSize: 12,
                color: "#9a9a96",
                backgroundColor: "#f3f3f1",
                borderRadius: 6,
              }}
            >
              digest: {error.digest}
            </code>
          ) : null}
          <div style={{ marginTop: 32 }}>
            <button
              onClick={reset}
              style={{
                appearance: "none",
                border: 0,
                background: "#1f1f1a",
                color: "white",
                padding: "10px 16px",
                borderRadius: 999,
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
