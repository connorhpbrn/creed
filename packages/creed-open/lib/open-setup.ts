import "server-only";

import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import { isSupabaseAdminConfigured } from "@creed/persistence/supabase/env";

type SchemaVersionClient = {
  rpc(name: "creed_schema_version"): Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

export const REQUIRED_OPEN_SCHEMA_VERSION = "20260815162526";
const READINESS_CACHE_MS = 15_000;

export type OpenDatabaseReadiness =
  | { ready: true; schemaVersion: string }
  | { ready: false; schemaVersion: string | null; reason: "not-configured" | "migration-required" | "unavailable" };

let cached:
  | { checkedAt: number; readiness: OpenDatabaseReadiness }
  | undefined;

export async function getOpenDatabaseReadiness(options?: {
  fresh?: boolean;
}): Promise<OpenDatabaseReadiness> {
  if (!isSupabaseAdminConfigured()) {
    return { ready: false, schemaVersion: null, reason: "not-configured" };
  }

  const now = Date.now();
  if (!options?.fresh && cached && now - cached.checkedAt < READINESS_CACHE_MS) {
    return cached.readiness;
  }

  const admin = getSupabaseAdminClient() as unknown as SchemaVersionClient;
  const { data, error } = await admin.rpc("creed_schema_version");
  const schemaVersion = typeof data === "string" ? data : null;
  const readiness: OpenDatabaseReadiness = error
    ? { ready: false, schemaVersion, reason: "unavailable" }
    : schemaVersion && schemaVersion >= REQUIRED_OPEN_SCHEMA_VERSION
      ? { ready: true, schemaVersion }
      : { ready: false, schemaVersion, reason: "migration-required" };

  cached = { checkedAt: now, readiness };
  return readiness;
}
