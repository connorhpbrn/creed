import "server-only";

import { createHmac, randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { getSupabaseAdminClient } from "@creed/persistence/supabase/admin";
import type { SupabaseLikeClient } from "@creed/persistence/supabase/types";
import {
  MAX_SPONSOR_USD,
  MIN_SPONSOR_USD,
} from "@creed/cloud/lib/sponsor-config";

const MAX_NAME_LENGTH = 50;
const MAX_MESSAGE_LENGTH = 240;

type SponsorEventKind = "pending" | "succeeded" | "failed" | "refund" | "dispute";

export type PublicSponsor = {
  id: string;
  name: string | null;
  message: string | null;
  image: string | null;
  totalCents: number;
  donationAmounts: number[];
};

type PublicSponsorRow = {
  id: string;
  name: string | null;
  message: string | null;
  avatar_path: string | null;
  total_cents: number | string;
  donation_amounts: number[] | null;
  total_count?: number | string;
};

function adminClient() {
  return getSupabaseAdminClient() as unknown as SupabaseLikeClient;
}

function identitySecret() {
  const value = process.env.CREED_ENCRYPTION_SECRET?.trim();
  if (!value) throw new Error("CREED_ENCRYPTION_SECRET is not configured.");
  return value;
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

export function normalizeSponsorProfile(input: {
  name?: unknown;
  message?: unknown;
}) {
  return {
    name: optionalText(input.name, MAX_NAME_LENGTH),
    message: optionalText(input.message, MAX_MESSAGE_LENGTH),
  };
}

export function sponsorIdentityHash(anonymousId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(anonymousId)) {
    throw new Error("Invalid anonymous sponsor identity.");
  }
  return createHmac("sha256", identitySecret())
    .update(`sponsor:${anonymousId}`)
    .digest("hex");
}

export async function getOrCreateSponsor(input: {
  userId: string | null;
  anonymousId: string;
  name: string | null;
  message: string | null;
}): Promise<string> {
  const { data, error } = await adminClient().rpc("get_or_create_sponsor", {
    p_candidate_id: randomUUID(),
    p_user_id: input.userId,
    p_anonymous_key_hash: input.userId
      ? null
      : sponsorIdentityHash(input.anonymousId),
    p_name: input.name,
    p_message: input.message,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== "string") throw new Error("Could not resolve sponsor.");
  return data;
}

function sponsorIntentFacts(paymentIntent: Stripe.PaymentIntent) {
  if (
    paymentIntent.metadata?.type !== "sponsor" ||
    paymentIntent.currency !== "usd"
  ) {
    return null;
  }
  const sponsorId = paymentIntent.metadata.sponsorId?.trim();
  const attemptId = paymentIntent.metadata.attemptId?.trim();
  const amountCents = paymentIntent.amount;
  if (
    !sponsorId ||
    !attemptId ||
    amountCents < MIN_SPONSOR_USD * 100 ||
    amountCents > MAX_SPONSOR_USD * 100
  ) {
    return null;
  }
  return { sponsorId, attemptId, amountCents };
}

async function applySponsorEvent(input: {
  paymentIntent: Stripe.PaymentIntent;
  kind: SponsorEventKind;
  eventCreated: number;
  amountRefundedCents?: number;
  disputeStatus?: string | null;
}): Promise<boolean> {
  const facts = sponsorIntentFacts(input.paymentIntent);
  if (!facts) return false;
  const { error } = await adminClient().rpc("apply_sponsor_donation_event", {
    p_sponsor_id: facts.sponsorId,
    p_amount_cents: facts.amountCents,
    p_payment_intent_id: input.paymentIntent.id,
    p_attempt_id: facts.attemptId,
    p_event_kind: input.kind,
    p_event_created: input.eventCreated,
    p_amount_refunded_cents: input.amountRefundedCents ?? 0,
    p_dispute_status: input.disputeStatus ?? null,
  });
  if (error) throw new Error(error.message);
  return true;
}

export async function recordPendingSponsorPayment(
  paymentIntent: Stripe.PaymentIntent
): Promise<boolean> {
  return applySponsorEvent({
    paymentIntent,
    kind: "pending",
    eventCreated: paymentIntent.created,
  });
}

export async function recordSponsorPayment(
  paymentIntent: Stripe.PaymentIntent,
  eventCreated = paymentIntent.created
): Promise<boolean> {
  if (paymentIntent.status !== "succeeded") return false;
  return applySponsorEvent({ paymentIntent, kind: "succeeded", eventCreated });
}

export async function failSponsorPayment(
  paymentIntent: Stripe.PaymentIntent,
  eventCreated: number
): Promise<boolean> {
  return applySponsorEvent({ paymentIntent, kind: "failed", eventCreated });
}

export async function refundSponsorPayment(
  paymentIntent: Stripe.PaymentIntent,
  amountRefundedCents: number,
  eventCreated: number
): Promise<boolean> {
  return applySponsorEvent({
    paymentIntent,
    kind: "refund",
    eventCreated,
    amountRefundedCents,
  });
}

export async function disputeSponsorPayment(
  paymentIntent: Stripe.PaymentIntent,
  status: string,
  eventCreated: number
): Promise<boolean> {
  return applySponsorEvent({
    paymentIntent,
    kind: "dispute",
    eventCreated,
    disputeStatus: status,
  });
}

function avatarUrl(path: string | null) {
  if (!path) return null;
  const admin = getSupabaseAdminClient();
  return admin.storage.from("sponsor-avatars").getPublicUrl(path).data.publicUrl;
}

function publicSponsorFromRow(row: PublicSponsorRow): PublicSponsor {
  return {
    id: row.id,
    name: row.name,
    message: row.message,
    image: avatarUrl(row.avatar_path),
    totalCents: Number(row.total_cents),
    donationAmounts: row.donation_amounts ?? [],
  };
}

export async function listPublicSponsors(input: {
  query: string;
  limit: number;
  offset: number;
}): Promise<{ sponsors: PublicSponsor[]; total: number }> {
  const numericQuery = input.query.trim().replace(/^\$/, "");
  const amountCents = /^\d+(?:\.\d{1,2})?$/.test(numericQuery)
    ? Math.round(Number(numericQuery) * 100)
    : null;
  const { data, error } = await adminClient().rpc("list_public_sponsors", {
    p_query: input.query.trim().slice(0, 80),
    p_amount_cents: amountCents,
    p_limit: input.limit,
    p_offset: input.offset,
  });
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? (data as PublicSponsorRow[]) : [];
  return {
    sponsors: rows.map(publicSponsorFromRow),
    total: rows.length ? Number(rows[0]?.total_count ?? rows.length) : 0,
  };
}

export async function getPublicSponsor(id: string): Promise<PublicSponsor | null> {
  const { data, error } = await adminClient().rpc("get_public_sponsor", {
    p_sponsor_id: id,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? (data[0] as PublicSponsorRow | undefined) : undefined;
  return row ? publicSponsorFromRow(row) : null;
}

export async function setSponsorAvatar(input: {
  paymentIntentId: string;
  avatarPath: string;
}): Promise<string | null> {
  const { data: donation, error: donationError } = await adminClient()
    .from("sponsor_donations")
    .select("sponsor_id,status")
    .eq("stripe_payment_intent_id", input.paymentIntentId)
    .eq("status", "succeeded")
    .maybeSingle();
  if (donationError) throw new Error(donationError.message);
  const sponsorId = (donation as { sponsor_id?: string } | null)?.sponsor_id;
  if (!sponsorId) return null;
  const { data: previous, error: previousError } = await adminClient()
    .from("sponsors")
    .select("avatar_path")
    .eq("id", sponsorId)
    .maybeSingle();
  if (previousError) throw new Error(previousError.message);
  const { error } = await adminClient()
    .from("sponsors")
    .update({ avatar_path: input.avatarPath, updated_at: new Date().toISOString() })
    .eq("id", sponsorId);
  if (error) throw new Error(error.message);
  return (previous as { avatar_path?: string | null } | null)?.avatar_path ?? null;
}
