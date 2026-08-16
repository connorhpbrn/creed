import "server-only";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import { isSupabaseAdminConfigured } from "@creed/persistence/supabase/env";
import { log } from "@/lib/observability";

export type AuditAction =
  | "tokens.rotated"
  | "mcp.token_rotated"
  | "github.connected"
  | "github.disconnected"
  | "account.deleted"
  | "ai.settings_updated"
  | "creed.claimed"
  | "creed.composed"
  | "creed.imported"
  | "creed.deleted"
  // Shared Creed
  | "shared.provisioned"
  | "shared.invite_created"
  | "shared.invite_resent"
  | "shared.invite_revoked"
  | "shared.invite_accepted"
  | "shared.invite_declined"
  | "shared.member_removed"
  | "shared.role_changed"
  | "shared.permission_changed"
  | "shared.byok_updated"
  | "shared.ai_mode_updated"
  | "shared.ownership_transferred"
  | "shared.version_control_updated"
  | "shared.github_connected"
  | "shared.github_disconnected"
  | "shared.deleted";

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
 * Fire-and-forget audit log entry. Never throws - audit failures should never
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
    // Audit is best-effort (never blocks the mutation), but the failure must
    // still be observable - the old console.warn was gated to non-production,
    // so audit-write failures were invisible in prod.
    log.warn(
      "audit_log_failed",
      { action: input.action },
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
