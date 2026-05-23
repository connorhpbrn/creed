import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export type AuditAction =
  | "tokens.rotated"
  | "mcp.token_rotated"
  | "github.connected"
  | "github.disconnected"
  | "account.deleted"
  | "ai.settings_updated"
  | "creed.claimed"
  | "creed.imported";

export type AuditLogInput = {
  userId: string;
  action: AuditAction;
  metadata?: Record<string, unknown>;
  request?: Request;
};

function clientIp(request: Request | undefined): string | null {
  if (!request) return null;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip") || null;
}

/**
 * Fire-and-forget audit log entry. Never throws — audit failures should never
 * block a sensitive action from completing. Call this after the action succeeds
 * so failed actions don't pollute the log.
 */
export async function recordAuditEvent(input: AuditLogInput): Promise<void> {
  if (!isSupabaseAdminConfigured()) {
    return;
  }

  try {
    const admin = getSupabaseAdminClient() as unknown as {
      from: (table: string) => {
        insert: (values: Record<string, unknown>) => Promise<{
          error: { message: string } | null;
        }>;
      };
    };
    await admin.from("creed_audit_log").insert({
      user_id: input.userId,
      action: input.action,
      metadata: input.metadata ?? {},
      ip_address: clientIp(input.request),
      user_agent: input.request?.headers.get("user-agent") ?? null,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[audit-log] Failed to record event", input.action, error);
    }
  }
}
