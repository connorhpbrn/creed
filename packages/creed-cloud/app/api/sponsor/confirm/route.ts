import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getStripeClient } from "@creed/cloud/lib/stripe";
import { recordSponsorPayment } from "@creed/cloud/lib/sponsors";
import { log } from "@/lib/observability";

export const runtime = "nodejs";

function callerIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit({
    scope: "sponsor-confirm",
    identifier: callerIp(request),
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many confirmation attempts. Try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  try {
    const body = (await request.json()) as { paymentIntentId?: unknown };
    const paymentIntentId =
      typeof body.paymentIntentId === "string" ? body.paymentIntentId.trim() : "";
    if (!paymentIntentId) {
      return NextResponse.json({ error: "Missing payment." }, { status: 400 });
    }

    const paymentIntent = await getStripeClient().paymentIntents.retrieve(
      paymentIntentId
    );
    const recorded = await recordSponsorPayment(paymentIntent);
    if (!recorded) {
      return NextResponse.json(
        { error: "Payment is not complete." },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error(
      "sponsor_confirmation_failed",
      {},
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: "Could not confirm the payment." },
      { status: 400 }
    );
  }
}
