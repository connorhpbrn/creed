import type { User } from "@supabase/supabase-js";

// Single source of truth for a user's display name.
//
// The user-set name is stored under `display_name` - a key OAuth providers
// never write. Supabase refreshes `full_name` / `name` in user_metadata from
// the provider's identity data on every OAuth login, so a custom name stored
// under those keys gets clobbered by e.g. Google's profile name the next time
// the user signs in. `display_name` first means the user's own edit always
// wins; the provider values remain the fallback for users who never set one.
export function getDisplayName(user: User, fallback = "You"): string {
  const meta = user.user_metadata ?? {};
  const pick = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";
  return (
    pick(meta.display_name) ||
    pick(meta.full_name) ||
    pick(meta.name) ||
    pick(meta.user_name) ||
    (user.email ? user.email.split("@")[0] : "") ||
    fallback
  );
}
