/**
 * Pure list operations behind the incident form's chronology editor: add, remove,
 * collapse/expand and MVP up/down reordering. Kept free of Angular so the reorder
 * semantics are unit-testable in isolation (see chronology-list.util.spec.ts).
 */

export type ChronologyIndicator = "GREEN" | "RED" | "BLUE" | "GRAY";

export interface ChronologyDraft {
  /** Local-only identity for @for tracking; never sent to the backend. */
  readonly key: number;
  indicator: ChronologyIndicator;
  /** datetime-local input value; "" when unset. */
  datetime: string;
  sourceUrl: string;
  content: string;
  collapsed: boolean;
}

export function emptyChronology(key: number): ChronologyDraft {
  return {
    key,
    indicator: "GREEN",
    datetime: "",
    sourceUrl: "",
    content: "",
    collapsed: false,
  };
}

/** Moves an item from one index to another, shifting the items in between.
 * Out-of-range or no-op indices return the list unchanged (same contents). */
export function moveChronology<T>(list: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return [...list];
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return [...list];
  if (fromIndex < 0 || fromIndex >= list.length) return [...list];
  if (toIndex < 0 || toIndex >= list.length) return [...list];

  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function canMoveUp(list: readonly unknown[], index: number): boolean {
  return index > 0;
}

export function canMoveDown(list: readonly unknown[], index: number): boolean {
  return index >= 0 && index < list.length - 1;
}

export function toggleCollapsed(list: readonly ChronologyDraft[], key: number): ChronologyDraft[] {
  return list.map((c) => (c.key === key ? { ...c, collapsed: !c.collapsed } : c));
}

export function removeChronology(list: readonly ChronologyDraft[], key: number): ChronologyDraft[] {
  return list.filter((c) => c.key !== key);
}
