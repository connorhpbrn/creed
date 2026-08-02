import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const VERSION = "v1";

function legacyKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

function versionedKey(secret: string) {
  return Buffer.from(hkdfSync("sha256", secret, "creed-secret-crypto", VERSION, 32));
}

function decodePart(value: string, expectedLength?: number) {
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value || (expectedLength && decoded.length !== expectedLength)) {
    throw new Error("Malformed encrypted secret.");
  }
  return decoded;
}

function decryptWithKey(parts: string[], key: Buffer) {
  const [ivValue, tagValue, encryptedValue] = parts;
  const decipher = createDecipheriv(ALGORITHM, key, decodePart(ivValue, IV_LENGTH));
  decipher.setAuthTag(decodePart(tagValue, TAG_LENGTH));
  return Buffer.concat([decipher.update(decodePart(encryptedValue)), decipher.final()]).toString("utf8");
}

export function encryptWithSecret(value: string, secret: string) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, versionedKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptWithSecrets(value: string, secrets: string[]) {
  const parts = value.split(".");
  const versioned = parts[0] === VERSION;
  const payload = versioned ? parts.slice(1) : parts;
  if (payload.length !== 3 || secrets.length === 0) throw new Error("Malformed encrypted secret.");

  for (const secret of secrets) {
    try {
      return decryptWithKey(payload, versioned ? versionedKey(secret) : legacyKey(secret));
    } catch {
      // Rotation deliberately tries the previous key after the current key.
    }
  }
  throw new Error("Encrypted secret could not be decrypted with the configured keys.");
}
