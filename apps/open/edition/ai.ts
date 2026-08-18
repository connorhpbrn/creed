import type { AiFeature } from "@/lib/ai/features";
import { getAiFeatureModel } from "@/lib/ai/feature-models";
import { readAiSettings } from "@/lib/ai/persistence";
import { decryptSecret } from "@creed/integrations/secret-crypto";

export type ResolvedAiCredential = {
  apiKey: string;
  modelId: string;
  mode: "byok" | "credits";
  reservationId?: string;
};

export async function resolveAiCredential(
  client: unknown,
  userId: string,
  feature: AiFeature,
  creedId?: string,
): Promise<ResolvedAiCredential> {
  const row = await readAiSettings(client, userId, creedId);
  if (!row?.encrypted_api_key || row.key_status !== "valid") {
    throw new Error("Add an OpenRouter key in Settings");
  }
  return {
    apiKey: decryptSecret(row.encrypted_api_key),
    modelId: getAiFeatureModel(feature),
    mode: "byok",
  };
}

export async function resolveSharedAiCredential(
  _creedId: string,
  _feature: AiFeature,
  _spentBy: string,
): Promise<never> {
  throw new Error("Shared Creeds are not available in Creed Open");
}

export async function cancelCreditReservation(_reservationId?: string): Promise<void> {}

export async function deductCredits(_input: {
  userId: string;
  costUsd: number;
  feature: AiFeature;
  modelId: string;
  reservationId?: string;
  creedId?: string;
}): Promise<{ chargedMicroUsd: number; balanceUsd: number } | null> {
  return null;
}

export async function deductSharedCredits(_input: {
  creedId: string;
  spentBy: string;
  costUsd: number;
  feature: AiFeature;
  modelId: string;
  reservationId?: string;
}): Promise<{ chargedMicroUsd: number; balanceUsd: number } | null> {
  return null;
}
