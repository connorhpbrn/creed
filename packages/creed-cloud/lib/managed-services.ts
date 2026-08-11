import "server-only";

export function hasManagedBilling(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() &&
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim(),
  );
}

export function hasManagedCredits(): boolean {
  return Boolean(process.env.OPENROUTER_PLATFORM_KEY?.trim());
}
