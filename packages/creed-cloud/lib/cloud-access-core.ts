export type CloudAccessMode = "private" | "public";

export function parseCloudAccessMode(value: string | undefined): CloudAccessMode {
  return value?.trim().toLowerCase() === "private" ? "private" : "public";
}

export function parseCloudTesterEmails(value: string | undefined): ReadonlySet<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function emailHasCloudAccess(
  mode: CloudAccessMode,
  testerEmails: ReadonlySet<string>,
  email: string | null | undefined,
): boolean {
  if (mode === "public") return true;
  return Boolean(email && testerEmails.has(email.trim().toLowerCase()));
}
