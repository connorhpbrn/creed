import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getStripeClient } from "@creed/cloud/lib/stripe";
import { recordSponsorPayment, setSponsorAvatar } from "@creed/cloud/lib/sponsors";
import { log } from "@/lib/observability";

const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function callerIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function validSignature(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (type === "image/png") {
    return bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]);
  }
  if (type === "image/webp") {
    return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit({
    scope: "sponsor-avatar",
    identifier: callerIp(request),
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many picture uploads. Try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const paymentIntentId = form?.get("paymentIntentId");
  if (!(file instanceof File) || typeof paymentIntentId !== "string") {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  if (!TYPES.has(file.type) || file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Use a JPG, PNG, or WebP image smaller than 3 MB." }, { status: 400 });
  }

  try {
    const paymentIntent = await getStripeClient().paymentIntents.retrieve(paymentIntentId);
    if (!(await recordSponsorPayment(paymentIntent))) {
      return NextResponse.json({ error: "Payment is not complete." }, { status: 409 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validSignature(file.type, bytes)) {
      return NextResponse.json({ error: "The selected file is not a valid image." }, { status: 400 });
    }
    const sponsorId = paymentIntent.metadata.sponsorId;
    const extension = TYPES.get(file.type) ?? "png";
    const path = `${sponsorId}/${Date.now()}-${randomBytes(8).toString("hex")}.${extension}`;
    const admin = getSupabaseAdminClient();
    const { error: uploadError } = await admin.storage.from("sponsor-avatars").upload(
      path,
      Buffer.from(bytes),
      { cacheControl: "31536000", contentType: file.type, upsert: false }
    );
    if (uploadError) throw new Error(uploadError.message);
    try {
      const previous = await setSponsorAvatar({ paymentIntentId, avatarPath: path });
      if (previous && previous !== path) {
        await admin.storage.from("sponsor-avatars").remove([previous]);
      }
    } catch (error) {
      await admin.storage.from("sponsor-avatars").remove([path]);
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error(
      "sponsor_avatar_save_failed",
      {},
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json({ error: "Could not save the picture." }, { status: 500 });
  }
}
