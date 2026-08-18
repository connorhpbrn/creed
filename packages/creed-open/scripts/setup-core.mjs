import { access, chmod, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const REQUIRED_ENVIRONMENT = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "CREED_OWNER_SECRET",
  "CREED_ENCRYPTION_SECRET",
];

export const REQUIRED_SCHEMA_VERSION = "20260815162526";

export const openDirectory = resolve(import.meta.dirname, "../../../apps/open");
export const environmentPath = resolve(openDirectory, ".env.local");

export async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function parseEnvironment(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

export function mergeEnvironment(source, updates) {
  const remaining = new Map(Object.entries(updates));
  const lines = source ? source.replace(/\s+$/, "").split(/\r?\n/) : [];
  const merged = lines.map((line) => {
    const separator = line.indexOf("=");
    if (separator <= 0 || line.trimStart().startsWith("#")) return line;
    const name = line.slice(0, separator).trim();
    if (!remaining.has(name)) return line;
    const value = remaining.get(name);
    remaining.delete(name);
    return `${name}=${value}`;
  });

  if (remaining.size > 0) {
    if (merged.length > 0 && merged.at(-1) !== "") merged.push("");
    for (const [name, value] of remaining) merged.push(`${name}=${value}`);
  }

  return `${merged.join("\n")}\n`;
}

export function validateSiteUrl(value) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" ||
        (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function getSupabaseProjectRef(value) {
  try {
    const url = new URL(value);
    const match = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return url.protocol === "https:" ? match?.[1] ?? null : null;
  } catch {
    return null;
  }
}

function legacyKeyRole(value) {
  if (!value.startsWith("eyJ")) return null;
  try {
    const payload = JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export function isPublishableKey(value) {
  return value.startsWith("sb_publishable_") || legacyKeyRole(value) === "anon";
}

export function isSecretKey(value) {
  return value.startsWith("sb_secret_") || legacyKeyRole(value) === "service_role";
}

export function validateEnvironment(values) {
  const issues = [];
  for (const name of REQUIRED_ENVIRONMENT) {
    if (!values[name]?.trim()) issues.push(`${name} is missing`);
  }
  if (values.NEXT_PUBLIC_SITE_URL && !validateSiteUrl(values.NEXT_PUBLIC_SITE_URL)) {
    issues.push("NEXT_PUBLIC_SITE_URL must be an HTTPS origin or a localhost HTTP origin");
  }
  if (
    values.NEXT_PUBLIC_SUPABASE_URL &&
    !getSupabaseProjectRef(values.NEXT_PUBLIC_SUPABASE_URL)
  ) {
    issues.push("NEXT_PUBLIC_SUPABASE_URL must be a hosted Supabase project URL");
  }
  if (
    values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    !isPublishableKey(values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  ) {
    issues.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not a recognised publishable key");
  }
  if (values.SUPABASE_SECRET_KEY && !isSecretKey(values.SUPABASE_SECRET_KEY)) {
    issues.push("SUPABASE_SECRET_KEY is not a recognised server key");
  }
  if (values.CREED_OWNER_SECRET && values.CREED_OWNER_SECRET.length < 32) {
    issues.push("CREED_OWNER_SECRET must be at least 32 characters");
  }
  if (values.CREED_ENCRYPTION_SECRET && values.CREED_ENCRYPTION_SECRET.length < 32) {
    issues.push("CREED_ENCRYPTION_SECRET must be at least 32 characters");
  }
  return issues;
}

export async function readEnvironment() {
  if (!(await exists(environmentPath))) return { source: "", values: {} };
  const source = await readFile(environmentPath, "utf8");
  return { source, values: parseEnvironment(source) };
}

export async function writeEnvironment(source, updates) {
  await writeFile(environmentPath, mergeEnvironment(source, updates), {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(environmentPath, 0o600);
}

// Windows cannot spawn npm.cmd or supabase.cmd without a shell. Unix binaries
// do not need one, so keep shell off elsewhere.
export function commandSpawnOptions(platform = process.platform, extra = {}) {
  return { ...extra, shell: platform === "win32" };
}

export function commandAvailable(command, args = ["--version"]) {
  return spawnSync(command, args, commandSpawnOptions(process.platform, { stdio: "ignore" })).status === 0;
}

export function supabaseCommand() {
  const executable = process.platform === "win32" ? "supabase.cmd" : "supabase";
  return resolve(openDirectory, "../../node_modules/.bin", executable);
}

export function runSupabase(args, options = {}) {
  return spawnSync(supabaseCommand(), args, commandSpawnOptions(process.platform, {
    cwd: openDirectory,
    stdio: options.quiet ? "ignore" : "inherit",
  })).status ?? 1;
}

export async function checkRemoteReadiness(values, fetchImplementation = fetch) {
  if (validateEnvironment(values).length > 0) {
    return { ready: false, reason: "environment" };
  }

  try {
    const authResponse = await fetchImplementation(
      `${values.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`,
      {
        headers: { apikey: values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!authResponse.ok) return { ready: false, reason: "publishable-key" };

    const response = await fetchImplementation(
      `${values.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/creed_schema_version`,
      {
        method: "POST",
        headers: {
          apikey: values.SUPABASE_SECRET_KEY,
          "content-type": "application/json",
        },
        body: "{}",
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) {
      return {
        ready: false,
        reason: response.status === 404 ? "migration" : "connection",
      };
    }
    const schemaVersion = await response.json();
    return typeof schemaVersion === "string" && schemaVersion >= REQUIRED_SCHEMA_VERSION
      ? { ready: true, schemaVersion }
      : { ready: false, reason: "migration" };
  } catch {
    return { ready: false, reason: "connection" };
  }
}
