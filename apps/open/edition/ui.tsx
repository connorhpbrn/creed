"use client";

import type { CreditsState } from "@/components/creed/settings-preload";

export function EditionDevPreview() {
  return null;
}

export function AccountDialog(_props: { open: boolean; onOpenChange(open: boolean): void }) {
  return null;
}

export function BillingDialog(_props: { open: boolean; onOpenChange(open: boolean): void }) {
  return null;
}

export function FeedbackMenuItem(_props: { open: boolean; onOpenChange(open: boolean): void }) {
  return null;
}

export function SharedSettings() {
  return null;
}

export function AddCreditsDialog(_props: {
  open: boolean;
  onOpenChange(open: boolean): void;
  currentBalanceUsd: number;
  creedId?: string;
  onToppedUp(): void;
}) {
  return null;
}

export function CreditsHistoryDialog(_props: {
  open: boolean;
  onOpenChange(open: boolean): void;
  transactions: CreditsState["transactions"];
}) {
  return null;
}

export function useEditionCheckout() {
  return {
    startCheckout: async (_options?: {
      plan?: "personal";
      cadence?: "monthly" | "yearly";
      returnTo?: "/pricing" | "/onboarding";
    }) => {},
    submitting: false,
  };
}

export function useEditionContinueHref() {
  return { href: "/onboarding", isPaid: false, canResume: false } as const;
}

export const GRANT_MONTHLY_USD = 0;
export const LOW_ALLOWANCE_RATIO = 0;
export const MIN_TOPUP_USD = 0;
export const MAX_TOPUP_USD = 0;
export const PRESET_TOPUPS_USD = [] as const;
