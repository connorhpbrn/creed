import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { log } from "@/lib/observability";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_NAME_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 1_000;
const MAX_STACK_LENGTH = 8_000;
const MAX_DIGEST_LENGTH = 160;

function boundedString(value: unknown, limit: number): string | undefined {
  return typeof value === "string" && value.length > 0
    ? value.slice(0, limit)
    : undefined;
}

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;

  const rateLimit = await checkRateLimit({
    scope: "client-errors",
    identifier: auth.user.id,
    limit: 12,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) {
    return new Response(null, { status: 204 });
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const message = boundedString(body?.message, MAX_MESSAGE_LENGTH);
  if (!message) {
    return NextResponse.json({ error: "Invalid error report." }, { status: 400 });
  }

  const error = new Error(message);
  error.name = boundedString(body?.name, MAX_NAME_LENGTH) ?? "ClientError";
  error.stack = boundedString(body?.stack, MAX_STACK_LENGTH) ?? error.stack;
  log.error(
    "client_route_error",
    {
      userId: auth.user.id,
      digest: boundedString(body?.digest, MAX_DIGEST_LENGTH),
    },
    error,
  );

  return new Response(null, { status: 204 });
}
