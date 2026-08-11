import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createInterface, emitKeypressEvents } from "node:readline";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import {
  checkRemoteReadiness,
  commandAvailable,
  environmentPath,
  getSupabaseProjectRef,
  isPublishableKey,
  isSecretKey,
  readEnvironment,
  runSupabase,
  supabaseCommand,
  validateSiteUrl,
  writeEnvironment,
} from "./setup-core.mjs";

if (process.argv.includes("--check")) {
  await import("./doctor.mjs");
  process.exit();
}

if (!stdin.isTTY || !stdout.isTTY) {
  stdout.write("Run npm run setup in an interactive terminal. For manual setup, read SETUP.md.\n");
  process.exit(1);
}

function ask(prompt, fallback = "") {
  const suffix = fallback ? ` (${fallback})` : "";
  const terminal = createInterface({ input: stdin, output: stdout });
  return new Promise((resolve) => {
    terminal.question(`${prompt}${suffix}: `, (answer) => {
      terminal.close();
      resolve(answer.trim() || fallback);
    });
  });
}

function askYesNo(prompt, defaultYes = true) {
  const hint = defaultYes ? "Y/n" : "y/N";
  return ask(`${prompt} [${hint}]`).then((answer) => {
    if (!answer) return defaultYes;
    return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
  });
}

function askHidden(prompt, existingValue = "") {
  const hint = existingValue
    ? "input hidden; press Enter to keep the current value"
    : "input hidden";
  stdout.write(`${prompt} (${hint}): `);
  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  let value = "";

  return new Promise((resolve) => {
    const finish = () => {
      stdin.off("keypress", onKeypress);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      resolve(value || existingValue);
    };
    const onKeypress = (character, key) => {
      if (key?.ctrl && key.name === "c") {
        stdin.off("keypress", onKeypress);
        stdin.setRawMode(false);
        stdin.pause();
        stdout.write("\n");
        process.exit(130);
      } else if (key?.name === "return" || key?.name === "enter") {
        finish();
      } else if (key?.name === "backspace") {
        value = value.slice(0, -1);
      } else if (character && !key?.ctrl && !key?.meta) {
        value += character;
      }
    };
    stdin.on("keypress", onKeypress);
  });
}

async function askUntil(prompt, fallback, validate, error) {
  while (true) {
    const value = await ask(prompt, fallback);
    if (validate(value)) return value;
    stdout.write(`${error}\n`);
  }
}

async function askHiddenUntil(prompt, fallback, validate, error) {
  while (true) {
    const value = await askHidden(prompt, fallback);
    if (validate(value)) return value;
    stdout.write(`${error}\n`);
  }
}

const nodeReady = Number(process.versions.node.split(".")[0]) >= 22;
const preflight = [
  ["Node.js 22 or newer", nodeReady],
  ["npm", commandAvailable("npm")],
  ["Git", commandAvailable("git")],
  ["Supabase CLI", commandAvailable(supabaseCommand())],
];

stdout.write("\nCreed Open setup\n\nPreflight\n");
for (const [name, ready] of preflight) stdout.write(`${ready ? "Ready" : "Missing"}  ${name}\n`);
if (preflight.some(([, ready]) => !ready)) {
  stdout.write("\nInstall the missing requirement, then run npm run setup again. See SETUP.md for help.\n");
  process.exit(1);
}

const { source, values } = await readEnvironment();
stdout.write("\nConnect Supabase\nCreate a project at https://database.new, then open its Connect dialog.\n\n");

const siteUrl = await askUntil(
  "Site URL",
  values.NEXT_PUBLIC_SITE_URL || "http://localhost:3001",
  validateSiteUrl,
  "Use an HTTPS origin without a path, or http://localhost:3001 for local development.",
);
const supabaseUrl = await askUntil(
  "Supabase project URL",
  values.NEXT_PUBLIC_SUPABASE_URL || "",
  (value) => Boolean(getSupabaseProjectRef(value)),
  "Use the hosted project URL ending in .supabase.co.",
);
const publishableKey = await askHiddenUntil(
  "Supabase publishable key",
  values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",
  isPublishableKey,
  "Use the sb_publishable_ key from the project's Connect dialog.",
);
const secretKey = await askHiddenUntil(
  "Supabase secret key",
  values.SUPABASE_SECRET_KEY || "",
  isSecretKey,
  "Use the sb_secret_ server key from Settings > API Keys.",
);
const ownerSecret =
  values.CREED_OWNER_SECRET?.length >= 32
    ? values.CREED_OWNER_SECRET
    : randomBytes(48).toString("base64url");
const encryptionSecret =
  values.CREED_ENCRYPTION_SECRET?.length >= 32
    ? values.CREED_ENCRYPTION_SECRET
    : randomBytes(32).toString("base64");

await writeEnvironment(source, {
  NEXT_PUBLIC_SITE_URL: siteUrl,
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  SUPABASE_SECRET_KEY: secretKey,
  CREED_OWNER_SECRET: ownerSecret,
  CREED_ENCRYPTION_SECRET: encryptionSecret,
});
stdout.write(`\nEnvironment ready at ${environmentPath.replace(`${process.cwd()}/`, "")}\n`);

stdout.write("Verifying the Supabase keys.\n");
const initialReadiness = await checkRemoteReadiness({
  NEXT_PUBLIC_SITE_URL: siteUrl,
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  SUPABASE_SECRET_KEY: secretKey,
  CREED_OWNER_SECRET: ownerSecret,
  CREED_ENCRYPTION_SECRET: encryptionSecret,
});
if (
  !initialReadiness.ready &&
  (initialReadiness.reason === "publishable-key" || initialReadiness.reason === "connection")
) {
  stdout.write("Supabase rejected the project URL or one of its keys. Check them and run npm run setup again.\n");
  process.exit(1);
}
stdout.write("Supabase keys verified.\n");

if (!(await askYesNo("Prepare the Supabase database now?"))) {
  stdout.write("\nEnvironment saved. Run npm run setup again when you are ready to prepare the database.\n");
  process.exit();
}

if (runSupabase(["projects", "list"], { quiet: true }) !== 0) {
  stdout.write("\nSign in to Supabase. The CLI will open your browser.\n");
  if (runSupabase(["login"]) !== 0) process.exit(1);
}

const projectRef = getSupabaseProjectRef(supabaseUrl);
stdout.write(`\nLinking Supabase project ${projectRef}. The CLI may ask for its database password.\n`);
if (runSupabase(["link", "--project-ref", projectRef]) !== 0) process.exit(1);

stdout.write("\nReviewing the database changes Creed needs.\n");
if (runSupabase(["db", "push", "--dry-run"]) !== 0) process.exit(1);
if (!(await askYesNo("Apply these database changes?"))) {
  stdout.write("\nNo database changes were applied. Run npm run setup again when you are ready.\n");
  process.exit();
}
if (runSupabase(["db", "push"]) !== 0) process.exit(1);

stdout.write("\nVerifying Creed Open.\n");
const { status = 1 } = spawnSync(
  process.execPath,
  [fileURLToPath(new URL("./doctor.mjs", import.meta.url))],
  { cwd: process.cwd(), stdio: "inherit" },
);
if (status !== 0) process.exit(status);

stdout.write("Creed Open is ready.\n\nRun npm run dev\nOpen http://localhost:3001\n");
