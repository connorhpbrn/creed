import type { User } from "@supabase/supabase-js";
import { hasValidOpenOwnerSession } from "@creed/open/lib/open-owner";

export const authorizeInteractiveRequest = hasValidOpenOwnerSession;

export function authorizeAuthenticatedUser(_user: User): boolean {
  return true;
}
