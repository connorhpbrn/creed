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
  title: "Create your account | Creed",
  description: "Create your Creed account.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const configured = isSupabaseConfigured();
  const nextPath = sanitizeNextPath((await searchParams).next);

  // Already signed in? Send them on to `next` (or the app) rather than the form.
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
    }
  }

  return (
    <AuthScreen
      mode="signup"
      configured={configured}
      nextPath={nextPath}
      privateAccess={isPrivateCloud()}
    />
  );
}
