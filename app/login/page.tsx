import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/auth/auth-screen";
import { sanitizeNextPath } from "@/lib/safe-next";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Creed.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const configured = isSupabaseConfigured();
  const params = await searchParams;
  const nextPath = params.next ? sanitizeNextPath(params.next) : "/dashboard";
  const showGoogle = !nextPath.startsWith("/accept-invite");
  const error =
    typeof params.error === "string" &&
    (params.error === "oauth_email_mismatch" ||
      params.error === "google_email_mismatch" ||
      params.error === "invite_required")
      ? params.error === "invite_required"
        ? "invite_required"
        : "oauth_email_mismatch"
      : undefined;

  // Already signed in? Don't show the sign-in form - send them on to `next`
  // (or the app).
  if (configured) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      redirect(nextPath);
    }
  }

  return (
    <AuthScreen
      configured={configured}
      nextPath={nextPath}
      authError={error}
      showGoogle={showGoogle}
    />
  );
}
