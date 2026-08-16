import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const baselinePath = join(repo, "packages/creed-app/tests/ui-parity.json");
const roots = [
  "apps/open/edition",
  "apps/cloud/edition",
  "packages/creed-app/components",
  "packages/creed-open/components",
  "packages/creed-cloud/components",
  "packages/creed-ui",
];
const visualAttributes = new Set([
  "className",
  "style",
  "variant",
  "size",
  "side",
  "align",
  "sideOffset",
  "alignOffset",
  "initial",
  "animate",
  "exit",
  "transition",
  "layout",
  "layoutId",
  "mode",
]);
const approvedLegacyDifferences = {
  "packages/creed-app/components/creed/connections-screen.tsx": "Open disables the retained CLI card.",
  "packages/creed-app/components/creed/onboarding-screen.tsx": "Open removes the Personal or Shared type step.",
  "packages/creed-app/components/creed/profile-avatar.tsx": "Editable fallback letters yield cleanly to the upload icon.",
  "packages/creed-app/components/creed/settings-screen.tsx": "Open is BYOK-only and Save uses the approved blue action.",
  "packages/creed-app/components/creed/shell.tsx": "Open replaces the hosted account control with the theme control.",
  "packages/creed-app/components/marketing/site-chrome.tsx": "Open uses GitHub and roadmap calls to action.",
  "packages/creed-app/components/marketing/stack-page-view.tsx": "Open omits Cloud-only stack rows.",
  "packages/creed-cloud/components/creed/shared-settings.tsx": "Shared Model usage uses the approved blue Save action.",
};

function filesUnder(path) {
  const absolute = join(repo, path);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || entry.name === "node_modules") return [];
    const child = join(absolute, entry.name);
    if (entry.isDirectory()) return filesUnder(relative(repo, child));
    return statSync(child).isFile() && /\.(?:ts|tsx)$/.test(entry.name)
      ? [relative(repo, child)]
      : [];
  });
}

function compact(source) {
  return source.replace(/\s+/g, " ").trim();
}

function visualSignatureFromSource(path, source) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const entries = [];

  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = compact(node.tagName.getText(file));
      const attributes = node.attributes.properties.flatMap((attribute) => {
        if (!ts.isJsxAttribute(attribute)) return [];
        const name = attribute.name.getText(file);
        if (!visualAttributes.has(name)) return [];
        return [`${name}=${attribute.initializer ? compact(attribute.initializer.getText(file)) : "true"}`];
      });
      if (attributes.length > 0) entries.push(`${tag}|${attributes.join("|")}`);
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
  return createHash("sha256").update(entries.join("\n")).digest("hex");
}

function visualSignature(path) {
  return visualSignatureFromSource(path, readFileSync(join(repo, path), "utf8"));
}

function legacyPath(path) {
  if (path.startsWith("packages/creed-app/components/")) {
    return `apps/creed/components/${path.slice("packages/creed-app/components/".length)}`;
  }
  if (path.startsWith("packages/creed-ui/")) {
    return `apps/creed/components/ui/${path.slice("packages/creed-ui/".length)}`;
  }
  if (path.startsWith("packages/creed-cloud/components/creed/")) {
    return `apps/creed/components/creed/${path.slice("packages/creed-cloud/components/creed/".length)}`;
  }
  return null;
}

function currentManifest() {
  const files = roots.flatMap(filesUnder).sort();
  const manifest = Object.fromEntries(files.map((path) => [path, visualSignature(path)]));
  manifest["packages/creed-app/app/globals.css"] = createHash("sha256")
    .update(readFileSync(join(repo, "packages/creed-app/app/globals.css"), "utf8"))
    .digest("hex");
  return manifest;
}

const current = currentManifest();
const againstArg = process.argv.find((arg) => arg.startsWith("--against="));
if (againstArg) {
  const ref = againstArg.slice("--against=".length);
  const changed = [];
  for (const path of Object.keys(current).filter((candidate) => candidate.endsWith(".tsx"))) {
    const previousPath = legacyPath(path);
    if (!previousPath) continue;
    let previous;
    try {
      previous = execFileSync("git", ["show", `${ref}:${previousPath}`], {
        cwd: repo,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      continue;
    }
    if (visualSignatureFromSource(previousPath, previous) !== current[path]) changed.push(path);
  }
  const unapproved = changed.filter((path) => !approvedLegacyDifferences[path]);
  const approved = changed.filter((path) => approvedLegacyDifferences[path]);
  if (approved.length > 0) {
    process.stdout.write(`Approved visual differences from ${ref}:\n`);
    for (const path of approved) {
      process.stdout.write(`- ${path}: ${approvedLegacyDifferences[path]}\n`);
    }
  }
  if (unapproved.length > 0) {
    process.stderr.write(`Unapproved visual differences from ${ref}:\n`);
    for (const path of unapproved) process.stderr.write(`- ${path}\n`);
    process.exit(1);
  }
  process.stdout.write(`All other mapped visual sources match ${ref}.\n`);
  process.exit(0);
}

if (process.argv.includes("--write")) {
  writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
  process.stdout.write(`Updated ${relative(repo, baselinePath)}\n`);
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  process.stderr.write("UI parity baseline is missing. Run npm run ui:parity:update intentionally.\n");
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const changed = [...new Set([...Object.keys(baseline), ...Object.keys(current)])]
  .filter((path) => baseline[path] !== current[path])
  .sort();

if (changed.length > 0) {
  process.stderr.write("UI parity changed in:\n");
  for (const path of changed) process.stderr.write(`- ${path}\n`);
  process.stderr.write("Review the visual change, then run npm run ui:parity:update only if intentional.\n");
  process.exit(1);
}

process.stdout.write(`UI parity verified across ${Object.keys(current).length} visual sources.\n`);
