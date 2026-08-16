export function filterAvailableCreeds<T extends { type: string }>(creeds: T[]): T[] {
  return creeds.filter((creed) => creed.type === "personal");
}

export function isCreedTypeAvailable(type: string): boolean {
  return type === "personal";
}
