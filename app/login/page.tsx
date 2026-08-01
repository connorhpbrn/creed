import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/auth/auth-screen";
import { sanitizeNextPath } from "@/lib/safe-next";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const configured = isSupabaseConfigured();
  const nextPath = sanitizeNextPath((await searchParams).next);

  // Already signed in? Don't show the login form (which would let them loop
  // through OAuth pointlessly) - send them on to `next` (or the app).
  if (configured) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      redirect(nextPath);
    }
  }

  return <AuthScreen mode="login" configured={configured} nextPath={nextPath} />;
}
