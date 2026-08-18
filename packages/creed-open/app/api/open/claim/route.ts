import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  deriveOpenOwnerPassword,
  getOpenOwnerConfigurationError,
  OPEN_OWNER_EMAIL,
  setOpenOwnerSessionCookie,
  verifyOpenOwnerSecret,
} from "@creed/open/lib/open-owner";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import {
  isSupabaseAdminConfigured,
  isSupabaseConfigured,
} from "@creed/persistence/supabase/env";
import { createSupabaseServerClient } from "@creed/persistence/supabase/server";
import type { SupabaseLikeClient } from "@creed/persistence/supabase/types";
import { getOpenDatabaseReadiness } from "@creed/open/lib/open-setup";

const MAX_BODY_BYTES = 1024;

async function readClaimBody(request: Request): Promise<{ secret?: unknown } | null> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return null;
  if (!request.body) return null;

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as { secret?: unknown })
      : null;
  } catch {
    return null;
  }
}

function requesterIdentifier(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const configurationError = getOpenOwnerConfigurationError();
  if (configurationError || !isSupabaseConfigured() || !isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Finish the Creed Open environment setup before claiming this installation." },
      { status: 503 },
    );
  }

  const verdict = await checkRateLimit({
    scope: "open-owner-claim",
    identifier: requesterIdentifier(request),
    limit: 8,
    windowMs: 15 * 60_000,
  });
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(verdict.retryAfterSeconds) },
      },
    );
  }

  const body = await readClaimBody(request);
  if (!body) {
    return NextResponse.json({ error: "Enter your owner secret." }, { status: 400 });
  }

  if (
    typeof body.secret !== "string" ||
    body.secret.length > 512 ||
    !verifyOpenOwnerSecret(body.secret)
  ) {
    return NextResponse.json({ error: "That owner secret is not valid." }, { status: 401 });
  }

  const readiness = await getOpenDatabaseReadiness({ fresh: true });
  if (!readiness.ready) {
    return NextResponse.json(
      { error: "Apply the Creed Supabase migrations before claiming this installation." },
      { status: 503 },
    );
  }

  const admin = getSupabaseAdminClient();
  const database = admin as unknown as SupabaseLikeClient;
  const installation = await database
    .from("creed_installation")
    .select("owner_user_id")
    .eq("singleton", true)
    .maybeSingle();
  if (installation.error) {
    return NextResponse.json({ error: "Could not prepare owner access." }, { status: 500 });
  }

  const password = deriveOpenOwnerPassword();
  const installationRow = installation.data as { owner_user_id?: string } | null;
  let owner = null;
  if (installationRow?.owner_user_id) {
    const storedOwner = await admin.auth.admin.getUserById(
      installationRow.owner_user_id,
    );
    if (storedOwner.error || !storedOwner.data.user) {
      return NextResponse.json(
        { error: "The stored installation owner is unavailable." },
        { status: 500 },
      );
    }
    owner = storedOwner.data.user;
  }

  if (!owner) {
    const created = await admin.auth.admin.createUser({
      email: OPEN_OWNER_EMAIL,
      password,
      email_confirm: true,
      app_metadata: { creed_open_owner: true },
      user_metadata: { name: "Personal" },
    });
    if (created.error || !created.data.user) {
      return NextResponse.json({ error: "Could not create owner access." }, { status: 500 });
    }
    owner = created.data.user;
    const stored = await database.from("creed_installation").insert({
      singleton: true,
      owner_user_id: owner.id,
    });
    if (stored.error) {
      await admin.auth.admin.deleteUser(owner.id);
      return NextResponse.json({ error: "Could not store owner access." }, { status: 500 });
    }
  } else {
    const updated = await admin.auth.admin.updateUserById(owner.id, {
      email: OPEN_OWNER_EMAIL,
      password,
      email_confirm: true,
      app_metadata: { ...owner.app_metadata, creed_open_owner: true },
      user_metadata: { ...owner.user_metadata, name: owner.user_metadata?.name || "Personal" },
    });
    if (updated.error) {
      return NextResponse.json({ error: "Could not refresh owner access." }, { status: 500 });
    }
  }

  const supabase = await createSupabaseServerClient();
  const signIn = await supabase.auth.signInWithPassword({
    email: OPEN_OWNER_EMAIL,
    password,
  });
  if (signIn.error || !signIn.data.user) {
    return NextResponse.json({ error: "Could not start the owner session." }, { status: 500 });
  }

  await setOpenOwnerSessionCookie();
  return NextResponse.json({ ok: true });
}
