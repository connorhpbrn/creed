"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/ui/arrow-right";
import { useAnimatedIconControls } from "@/components/creed/animated-icon-controls";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

export function GoogleSignInButton({
  label = "Continue with Google",
  configured = true,
  className,
  showIcon = true,
  redirectTo,
}: {
  label?: string;
  configured?: boolean;
  className?: string;
  showIcon?: boolean;
  // Optional post-auth destination. Forwarded through `/auth/callback`
  // via its `next` query param. The pricing card passes
  // `/pricing?checkout=true` so the user lands back on pricing ready to
  // be auto-handed to Stripe; `/payment/success` passes `/file` so the
  // post-purchase sign-in lands the user inside the app. When omitted,
  // the callback's existing default (root redirect) applies.
  redirectTo?: string;
}) {
  const [loading, setLoading] = useState(false);
  const arrowIcon = useAnimatedIconControls(80, undefined, 420);

  async function handleSignIn() {
    if (!configured) {
      return;
    }

    try {
      setLoading(true);
      const supabase = getSupabaseBrowserClient();
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      if (redirectTo) {
        callbackUrl.searchParams.set("next", redirectTo);
      }
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
        },
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      className={cn(
        "rounded-md bg-[var(--creed-text-primary)] px-5 text-white hover:bg-[#2B2B28]",
        className
      )}
      onClick={handleSignIn}
      disabled={loading || !configured}
      onMouseEnter={arrowIcon.start}
      onMouseLeave={arrowIcon.settle}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse") {
          arrowIcon.start();
        }
      }}
    >
      {loading ? (
        <>
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Redirecting
        </>
      ) : (
        <>
          {label}
          {showIcon ? <ArrowRightIcon ref={arrowIcon.iconRef} className="h-3.5 w-3.5" size={14} /> : null}
        </>
      )}
    </Button>
  );
}
