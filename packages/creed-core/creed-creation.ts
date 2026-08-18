export const CREED_NAME_MAX_LENGTH = 80;

export type NewCreedType = "personal" | "shared";

export type NewCreedInput = {
  name: string;
  type: NewCreedType;
};

export type NewCreedValidation =
  | { ok: true; value: NewCreedInput }
  | { ok: false; error: string };

/** Sensible New Creed defaults from the account display name. */
export function defaultNewCreedName(
  type: NewCreedType,
  accountName: string,
): string {
  const first = accountName.trim().split(/\s+/)[0] || "";
  const personal = (first || "Personal").slice(0, CREED_NAME_MAX_LENGTH);
  if (type === "personal") return personal;
  const shared = first ? `${first}'s team` : "Team";
  return shared.slice(0, CREED_NAME_MAX_LENGTH);
}

export function validateNewCreedInput(input: unknown): NewCreedValidation {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Enter a Creed name." };
  }

  const candidate = input as { name?: unknown; type?: unknown };
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  if (!name) {
    return { ok: false, error: "Enter a Creed name." };
  }
  if (name.length > CREED_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Keep the Creed name under ${CREED_NAME_MAX_LENGTH} characters.`,
    };
  }
  if (candidate.type !== "personal" && candidate.type !== "shared") {
    return { ok: false, error: "Choose Personal or Shared." };
  }

  return { ok: true, value: { name, type: candidate.type } };
}
