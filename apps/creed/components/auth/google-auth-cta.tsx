"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/ui/arrow-right";
import { useAnimatedIconControls } from "@/components/creed/animated-icon-controls";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type GoogleAuthCtaProps = {
  label?: string;
  loadingLabel?: string;
  className?: string;
  configured?: boolean;
  variant?: "primary" | "secondary";
};

export function GoogleAuthCta({
  label = "Continue with Google",
  loadingLabel = "Redirecting",
  className,
  configured = true,
  variant = "primary",
}: GoogleAuthCtaProps) {
  const [loading, setLoading] = useState(false);
  const arrowIcon = useAnimatedIconControls(80, undefined, 420);

  async function handleSignIn() {
    if (!configured) {
      return;
    }

    try {
      setLoading(true);
      const supabase = getSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback`;
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
        },
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      className={cn(
        variant === "primary"
          ? "rounded-md bg-[var(--creed-text-primary)] px-5 text-white hover:bg-[#2B2B28]"
          : "rounded-md border border-white/18 bg-white/10 px-5 text-white hover:bg-white/16",
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
          {loadingLabel}
          <LoaderCircle className="h-4 w-4 animate-spin" />
        </>
      ) : (
        <>
          {label}
          <ArrowRightIcon ref={arrowIcon.iconRef} className="h-3.5 w-3.5" size={14} />
        </>
      )}
    </Button>
  );
}
