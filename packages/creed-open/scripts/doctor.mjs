import {
  checkRemoteReadiness,
  commandAvailable,
  environmentPath,
  exists,
  readEnvironment,
  supabaseCommand,
  validateEnvironment,
} from "./setup-core.mjs";

const rows = [];
const add = (name, status, detail = "") => rows.push({ name, status, detail });

add("Node.js", Number(process.versions.node.split(".")[0]) >= 22 ? "Ready" : "Needs attention", "22 or newer");
add("npm", commandAvailable("npm") ? "Ready" : "Needs attention");
add("Git", commandAvailable("git") ? "Ready" : "Needs attention");
add("Supabase CLI", commandAvailable(supabaseCommand()) ? "Ready" : "Needs attention");

if (!(await exists(environmentPath))) {
  add("Environment", "Needs setup", "Run npm run setup");
  add("Database", "Not checked", "Environment required");
} else {
  const { values } = await readEnvironment();
  const issues = validateEnvironment(values);
  add("Environment", issues.length === 0 ? "Ready" : "Needs attention", issues[0] ?? "");

  if (issues.length === 0) {
    const readiness = await checkRemoteReadiness(values);
    add(
      "Database",
      readiness.ready ? "Ready" : "Needs attention",
      readiness.ready
        ? `Schema ${readiness.schemaVersion}`
        : readiness.reason === "migration"
          ? "Run npm run setup to apply the database"
          : readiness.reason === "publishable-key"
            ? "The Supabase publishable key was rejected"
            : "Could not verify the Supabase connection",
    );
  } else {
    add("Database", "Not checked", "Fix the environment first");
  }
}

const width = Math.max(...rows.map((row) => row.name.length));
process.stdout.write("\nCreed Open doctor\n\n");
for (const row of rows) {
  const detail = row.detail ? `  ${row.detail}` : "";
  process.stdout.write(`${row.name.padEnd(width)}  ${row.status}${detail}\n`);
}
process.stdout.write("\n");

if (rows.some((row) => row.status === "Needs attention" || row.status === "Needs setup")) {
  process.exitCode = 1;
}
