import type { User } from "@supabase/supabase-js";
import { canAccessCloud } from "@creed/cloud/lib/cloud-access";

export async function authorizeInteractiveRequest(): Promise<boolean> {
  return true;
}

export function authorizeAuthenticatedUser(user: User): boolean {
  return canAccessCloud(user.email);
}
