import type { Metadata } from "next";
import { ResetPasswordScreen } from "@creed/cloud/components/auth/reset-password-screen";
import { isSupabaseConfigured } from "@creed/persistence/supabase/env";

// Credential surface: kept under the strict nonce CSP, which requires
// request-time rendering (see lib/csp-policy.ts).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reset password | Creed",
  description: "Choose a new password for your Creed account.",
};

export default function ResetPasswordPage() {
  return <ResetPasswordScreen configured={isSupabaseConfigured()} />;
}
