import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveSignedInContinueHref } from "../lib/marketing/signed-in-continue.ts";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("unpaid users are sent to onboarding, never straight into /file", () => {
  assert.equal(resolveSignedInContinueHref(false), "/onboarding");
  assert.equal(resolveSignedInContinueHref(true), "/file");
});

test("marketing header Continue uses the shared resume-aware href", () => {
  const chrome = source("../components/marketing/site-chrome.tsx");
  assert.match(chrome, /useEditionContinueHref/);
  assert.match(chrome, /continueHref/);
  assert.doesNotMatch(
    chrome,
    /authState === "signed-in"\s*\?\s*\[\s*\{\s*label:\s*"Continue",\s*href:\s*"\/file"/,
  );
});

test("pricing checkout returns to pricing; get started opens onboarding signup", () => {
  const pricing = source("../../creed-cloud/components/marketing/pricing-page-view.tsx");
  const checkout = source("../../creed-cloud/app/api/stripe/checkout/route.ts");
  const hero = source("../components/auth/landing-hero.tsx");
  const onboardingPage = source("../../creed-cloud/app/onboarding/page.tsx");
  assert.match(pricing, /redirectTo="\/pricing"/);
  assert.match(pricing, /returnTo: "\/pricing"/);
  assert.match(checkout, /cancel_url: `\$\{baseUrl\}\$\{returnTo\}`/);
  assert.match(checkout, /successNext/);
  assert.match(hero, /\/signup\?next=\/onboarding/);
  assert.match(onboardingPage, /\/signup\?next=\/onboarding/);
});
