import "server-only";
import { createHash } from "node:crypto";
import { decryptWithSecrets, encryptWithSecret } from "@/lib/secret-crypto-core";

function getEncryptionSecrets() {
  const secret = process.env.CREED_ENCRYPTION_SECRET;

  if (!secret) {
    throw new Error("CREED_ENCRYPTION_SECRET is not configured.");
  }

  return [secret, process.env.CREED_ENCRYPTION_SECRET_PREVIOUS].filter(
    (value): value is string => Boolean(value)
  );
}

export function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function encryptSecret(value: string) {
  return encryptWithSecret(value, getEncryptionSecrets()[0]);
}

export function decryptSecret(value: string, label = "secret") {
  try {
    return decryptWithSecrets(value, getEncryptionSecrets());
  } catch {
    throw new Error(`Stored ${label} is malformed or cannot be decrypted.`);
  }
}
