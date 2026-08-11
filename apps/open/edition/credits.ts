export async function ensureCreditsHomeCreed(
  _userId: string,
  _creedId?: string,
): Promise<void> {}

export async function reassignCreditsHomeBeforeDelete(_input: {
  userId: string;
  deletingCreedId: string;
  preferredNextCreedId?: string | null;
}): Promise<string | null> {
  return null;
}
