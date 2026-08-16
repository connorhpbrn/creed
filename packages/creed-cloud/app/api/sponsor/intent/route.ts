import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@creed/persistence/supabase/server";
import {
  MAX_SPONSOR_USD,
  MIN_SPONSOR_USD,
} from "@creed/cloud/lib/sponsor-config";
import {
  getStripeClient,
  getStripePublishableKey,
} from "@creed/cloud/lib/stripe";
import { checkRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/observability";
import {
  getOrCreateSponsor,
  normalizeSponsorProfile,
  recordPendingSponsorPayment,
} from "@creed/cloud/lib/sponsors";

export const runtime = "nodejs";

function callerIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit({
    scope: "sponsor-intent",
    identifier: callerIp(request),
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many payment attempts. Try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  try {
    const body = (await request.json()) as {
      amountUsd?: unknown;
      attemptId?: unknown;
      anonymousId?: unknown;
      name?: unknown;
      message?: unknown;
    };
    const amountUsd =
      typeof body.amountUsd === "number" ? body.amountUsd : Number(body.amountUsd);
    const amountCents = Math.round(amountUsd * 100);
    const validAmount =
      Number.isFinite(amountUsd) &&
      Math.abs(amountUsd * 100 - amountCents) < Number.EPSILON * 100 &&
      amountCents >= MIN_SPONSOR_USD * 100 &&
      amountCents <= MAX_SPONSOR_USD * 100;

    if (!validAmount) {
      return NextResponse.json(
        {
          error: `Enter an amount between $${MIN_SPONSOR_USD} and $${MAX_SPONSOR_USD}.`,
        },
        { status: 400 }
      );
    }

    const attemptId = typeof body.attemptId === "string" ? body.attemptId : "";
    const anonymousId = typeof body.anonymousId === "string" ? body.anonymousId : "";
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i;
    if (!uuidPattern.test(attemptId) || !uuidPattern.test(anonymousId)) {
      return NextResponse.json({ error: "Invalid payment attempt." }, { status: 400 });
    }

    const { name, message } = normalizeSponsorProfile(body);
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    const sponsorId = await getOrCreateSponsor({
      userId: user?.id ?? null,
      anonymousId,
      name,
      message,
    });

    const intent = await getStripeClient().paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        metadata: {
          type: "sponsor",
          product: "creed_sponsorship",
          sponsorId,
          attemptId,
        },
      },
      { idempotencyKey: `sponsor:${attemptId}` }
    );
    await recordPendingSponsorPayment(intent);

    return NextResponse.json({
      clientSecret: intent.client_secret,
      publishableKey: getStripePublishableKey(),
      paymentIntentId: intent.id,
    });
  } catch (error) {
    log.error(
      "sponsor_intent_failed",
      {},
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: "Could not start the payment." },
      { status: 400 }
    );
  }
}
