// Transient, never serialized. Consumed once even when a conversation remounts.
const pending = new Set<string>();
export function markMessageEntrance(id: string) {
  pending.add(id);
}
export function consumeMessageEntrance(id: string) {
  const value = pending.has(id);
  pending.delete(id);
  return value;
}
export function clearMessageEntrances() {
  pending.clear();
}
