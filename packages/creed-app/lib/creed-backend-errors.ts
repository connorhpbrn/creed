export function isSupabaseTableMissingError(error: unknown) {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";

  return (
    message.includes("schema cache") ||
    message.includes("Could not find the table") ||
    message.includes('relation "') ||
    message.includes("does not exist")
  );
}
