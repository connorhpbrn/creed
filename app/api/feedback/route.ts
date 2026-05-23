import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { log } from "@/lib/observability";

const MEDIAN_ENDPOINT = "https://api.median.sh/api/feedback";

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const apiKey = process.env.MEDIAN_API_KEY?.trim();
  if (!apiKey) {
    log.warn("feedback_no_api_key", { userId: auth.user.id });
    return NextResponse.json(
      { error: "Feedback isn't configured for this deployment." },
      { status: 503 }
    );
  }

  let body: { content?: unknown; sourceUrl?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const content =
    typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json(
      { error: "Feedback can't be empty." },
      { status: 400 }
    );
  }
  if (content.length > 10_000) {
    return NextResponse.json(
      { error: "Feedback is too long (10k characters max)." },
      { status: 400 }
    );
  }

  const sourceUrl =
    typeof body.sourceUrl === "string" && body.sourceUrl.length <= 500
      ? body.sourceUrl
      : undefined;

  const author = auth.user.email ?? auth.user.id;

  try {
    const upstream = await fetch(MEDIAN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        content,
        author,
        sourceUrl,
        // Disable median's LLM classifier so every submission lands in the
        // dashboard. With classify=true, short / test / off-topic feedback
        // gets silently filtered out (still returns 202, but never appears).
        classify: false,
        metadata: {
          userId: auth.user.id,
          submittedAt: new Date().toISOString(),
        },
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      log.error(
        "feedback_upstream_failed",
        { userId: auth.user.id, status: upstream.status, text },
        new Error("median_upstream_failed")
      );
      return NextResponse.json(
        { error: "Feedback service rejected the request." },
        { status: 502 }
      );
    }

    // Surface the upstream requestId in the dev console so you can confirm
    // the submission actually reached median.sh.
    const upstreamPayload = await upstream
      .json()
      .catch(() => ({} as Record<string, unknown>));
    log.info("feedback_sent", {
      userId: auth.user.id,
      upstreamStatus: upstream.status,
      requestId:
        typeof upstreamPayload?.requestId === "string"
          ? upstreamPayload.requestId
          : null,
    });

    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    log.error(
      "feedback_upstream_error",
      { userId: auth.user.id },
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: "Couldn't reach feedback service." },
      { status: 502 }
    );
  }
}
