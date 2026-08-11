// Shared destination for signed-in marketing CTAs (header Continue, hero,
// closing band). Unpaid users go to onboarding (resume or start). Pricing is
// reached by navigating to /pricing deliberately, not via Get Started.
// Only Cloud-entitled users open /file.
export type SignedInContinueHref = "/file" | "/onboarding";

export function resolveSignedInContinueHref(isPaid: boolean): SignedInContinueHref {
  if (isPaid) return "/file";
  return "/onboarding";
}
