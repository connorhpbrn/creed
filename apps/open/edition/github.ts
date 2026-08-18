import type { User } from "@supabase/supabase-js";
import type {
  EditionSharedGitHubIntegration,
  EditionSharedVersionControlPatch,
  EditionSharedVersionControlRow,
} from "@/lib/edition-github-types";

export async function resolveManagedSharedCreedId(
  _client: unknown,
  _user: User,
): Promise<string | null> {
  return null;
}

export async function readSharedGitHubIntegration(
  _creedId: string,
): Promise<EditionSharedGitHubIntegration | null> {
  return null;
}

export async function withSharedGitHubAccess<T>(
  _creedId: string,
  _operation: (accessToken: string) => Promise<T>,
): Promise<T> {
  throw new Error("Shared GitHub connections are not available in Creed Open.");
}

export async function readSharedVersionControl(
  _creedId: string,
): Promise<EditionSharedVersionControlRow | null> {
  return null;
}

export async function updateSharedVersionControlSync(
  _creedId: string,
  _patch: EditionSharedVersionControlPatch,
): Promise<void> {
  throw new Error("Shared version control is not available in Creed Open.");
}
