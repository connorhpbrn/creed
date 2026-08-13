import "server-only";
import { isPrivateCloud } from "@creed/cloud/lib/cloud-access";

export function hasManagedBilling(): boolean {
  return Boolean(
    !isPrivateCloud() &&
      process.env.STRIPE_SECRET_KEY?.trim() &&
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim(),
  );
}

export function hasManagedCredits(): boolean {
  return Boolean(process.env.OPENROUTER_PLATFORM_KEY?.trim());
}
