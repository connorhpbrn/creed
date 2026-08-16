import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthScreen } from "@creed/cloud/components/auth/auth-screen";
import { sanitizeNextPath } from "@/lib/safe-next";
import { isSupabaseConfigured } from "@creed/persistence/supabase/env";
import { createSupabaseServerClient } from "@creed/persistence/supabase/server";
import { canAccessCloud, isPrivateCloud } from "@creed/cloud/lib/cloud-access";

// Credential surface: kept under the strict nonce CSP, which requires
// request-time rendering (see lib/csp-policy.ts).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in | Creed",
  description: "Sign in to your Creed.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; access?: string | string[] }>;
}) {
  const configured = isSupabaseConfigured();
  const params = await searchParams;
  const nextPath = sanitizeNextPath(params.next);
  let accessDenied = params.access === "private";

  // Already signed in? Don't show the login form (which would let them loop
  // through OAuth pointlessly) - send them on to `next` (or the app).
  if (configured) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      if (canAccessCloud(user.email)) {
        redirect(nextPath);
      }
      await supabase.auth.signOut();
      accessDenied = true;
    }
  }

  return (
    <AuthScreen
      mode="login"
      configured={configured}
      nextPath={nextPath}
      privateAccess={isPrivateCloud()}
      accessDenied={accessDenied}
    />
  );
}
