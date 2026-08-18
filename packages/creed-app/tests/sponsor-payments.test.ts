import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("sponsor payments stay Cloud-only and Stripe-verified", async () => {
  const [intent, confirm, webhook, persistence, cloudUi, checkoutFields, openUi] =
    await Promise.all([
      read("creed-cloud/app/api/sponsor/intent/route.ts"),
      read("creed-cloud/app/api/sponsor/confirm/route.ts"),
      read("creed-cloud/app/api/stripe/webhook/route.ts"),
      read("creed-cloud/lib/sponsors.ts"),
      read("creed-cloud/components/marketing/sponsor-dialog.tsx"),
      read("creed-cloud/components/creed/stripe-checkout-fields.tsx"),
      read("creed-open/components/marketing/sponsor-dialog.tsx"),
    ]);

  assert.match(intent, /scope: "sponsor-intent"/);
  assert.match(intent, /amountCents <= MAX_SPONSOR_USD \* 100/);
  assert.match(intent, /type: "sponsor"/);
  assert.match(intent, /idempotencyKey: `sponsor:\$\{attemptId\}`/);
  assert.match(intent, /getOrCreateSponsor/);
  assert.match(intent, /recordPendingSponsorPayment\(intent\)/);
  assert.match(confirm, /paymentIntents\.retrieve/);
  assert.match(confirm, /recordSponsorPayment\(paymentIntent\)/);
  assert.match(webhook, /recordSponsorPayment\(paymentIntent, event\.created\)/);
  assert.match(
    webhook,
    /charge\.dispute\.created/
  );
  assert.match(webhook, /refund\.failed/);
  assert.match(webhook, /payment_intent\.payment_failed/);
  assert.match(persistence, /apply_sponsor_donation_event/);
  assert.match(persistence, /list_public_sponsors/);
  assert.match(cloudUi, /StripeCheckoutFields/);
  assert.match(cloudUi, /applePayButtonType="contribute"/);
  assert.match(checkoutFields, /ExpressCheckoutElement/);
  assert.match(checkoutFields, /applePay: "always"/);
  assert.match(cloudUi, /\/api\/sponsor\/intent/);
  assert.doesNotMatch(openUi, /stripe|PaymentElement/i);
});
