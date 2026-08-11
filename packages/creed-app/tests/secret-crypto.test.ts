import assert from "node:assert/strict";
import test from "node:test";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { decryptWithSecrets, encryptWithSecret } from "@creed/integrations/secret-crypto-core";

test("versioned ciphertext supports current and previous keys", () => {
  const encrypted = encryptWithSecret("token", "old-key");
  assert.match(encrypted, /^v1\./);
  assert.equal(decryptWithSecrets(encrypted, ["new-key", "old-key"]), "token");
});

test("legacy ciphertext remains readable during rotation", () => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update("old-key").digest(), iv);
  const encrypted = Buffer.concat([cipher.update("token", "utf8"), cipher.final()]);
  const legacy = [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64")).join(".");
  assert.equal(decryptWithSecrets(legacy, ["new-key", "old-key"]), "token");
});

test("tampered ciphertext is rejected", () => {
  const encrypted = encryptWithSecret("token", "key");
  assert.throws(() => decryptWithSecrets(`${encrypted}x`, ["key"]));
});
