export function filterAvailableCreeds<T extends { type: string }>(creeds: T[]): T[] {
  return creeds;
}

export function isCreedTypeAvailable(type: string): boolean {
  return type === "personal" || type === "shared";
}
