"use client";

import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/ui/arrow-right";
import { useAnimatedIconControls } from "@/components/creed/animated-icon-controls";
import { useOAuthSignIn } from "@/components/auth/use-oauth-sign-in";
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
  // via its `next` query param. The pricing card and landing "Get Started"
  // pass `/onboarding` so the user lands in the free onboarding funnel;
  // `/payment/success` passes `/file` so the post-purchase sign-in lands
  // the user inside the app. When omitted, the callback's existing default
  // (root redirect) applies.
  redirectTo?: string;
}) {
  const { signIn, pendingProvider } = useOAuthSignIn(configured, redirectTo);
  const loading = pendingProvider === "google";
  const arrowIcon = useAnimatedIconControls(80, undefined, 420);

  return (
    <Button
      className={cn(
        "rounded-md bg-[var(--creed-text-primary)] px-5 text-[var(--creed-button-primary-fg)] hover:bg-[var(--creed-button-primary-hover)]",
        className
      )}
      onClick={() => void signIn("google")}
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
          Redirecting
          <LoaderCircle className="h-4 w-4 animate-spin" />
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
