import "server-only";
import { log } from "@/lib/observability";

// Minimal transactional email sender via Resend's HTTP API.
//
// No SDK dependency: one fetch to https://api.resend.com/emails. Used for
// Company invite emails. Fails closed (returns { ok: false } + logs) so a send
// failure never throws into the invite flow - the invite row is still created
// and can be resent. RESEND_API_KEY and RESEND_FROM_EMAIL must be set; without
// them, send is skipped and reported as not-ok.

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export type SendEmailResult = { ok: true; id: string | null } | { ok: false; error: string };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    log.warn("email_send_skipped_unconfigured", { to: input.to });
    return { ok: false, error: "Email is not configured." };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      log.error("email_send_failed", { to: input.to, status: response.status, detail });
      return { ok: false, error: `Email send failed (${response.status}).` };
    }

    const body = (await response.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: body?.id ?? null };
  } catch (error) {
    log.error("email_send_threw", {
      to: input.to,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: "Email send failed." };
  }
}
