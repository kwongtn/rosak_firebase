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

/** The fields a rider edits on a row. */
export type ChronologyPatch = Partial<Omit<ChronologyDraft, "key">>;

/** Returns the list with one row replaced by a copy carrying `patch`, so the signal holding the list
 * sees a new value on every edit. The other rows keep their identity. */
export function updateChronology(
  list: readonly ChronologyDraft[],
  key: number,
  patch: ChronologyPatch,
): ChronologyDraft[] {
  return list.map((c) => (c.key === key ? { ...c, ...patch } : c));
}

/** A row with nothing typed in it, such as an "Add entry" never filled in. The indicator alone is
 * not content. Submit drops these rather than sending a blank timeline entry. */
export function isBlankChronology(c: ChronologyDraft): boolean {
  return !c.content.trim() && !c.datetime && !c.sourceUrl.trim();
}

/** The problems that block submit, keyed by row: a row with anything in it needs a description, or
 * the public card shows an empty timeline entry. Entries are numbered as the form lists them. */
export function chronologyErrors(list: readonly ChronologyDraft[]): Map<number, string> {
  const errors = new Map<number, string>();
  list.forEach((c, index) => {
    if (!isBlankChronology(c) && !c.content.trim()) {
      errors.set(c.key, `Entry ${index + 1} has no description. Fill it in or remove it.`);
    }
  });
  return errors;
}

/** The rows as the create and update mutations take them, in list order, blank rows dropped. */
export function chronologyInputs(list: readonly ChronologyDraft[]) {
  return list
    .filter((c) => !isBlankChronology(c))
    .map((c) => ({
      indicator: c.indicator,
      datetime: c.datetime ? new Date(c.datetime).toISOString() : null,
      // Trimmed with the same rule as the blank-row filter, so a whitespace-only URL is no URL.
      sourceUrl: c.sourceUrl.trim() || null,
      content: c.content.trim() || null,
    }));
}

export function toggleCollapsed(list: readonly ChronologyDraft[], key: number): ChronologyDraft[] {
  return list.map((c) => (c.key === key ? { ...c, collapsed: !c.collapsed } : c));
}

/** Sets every draft's `collapsed` flag to `collapsed` — the "Collapse all / Expand all" header
 * toggle. Immutable: always returns a new array (and new row objects for rows whose flag
 * changes), so signal consumers get a fresh reference to trigger updates. */
export function setAllCollapsed(
  list: readonly ChronologyDraft[],
  collapsed: boolean,
): ChronologyDraft[] {
  return list.map((c) => (c.collapsed === collapsed ? c : { ...c, collapsed }));
}

export function removeChronology(list: readonly ChronologyDraft[], key: number): ChronologyDraft[] {
  return list.filter((c) => c.key !== key);
}

/** Display label for a chronology indicator: only the first letter capitalized
 * ("Green"), matching the severity label convention. */
export function indicatorLabel(indicator: ChronologyIndicator): string {
  return indicator.charAt(0) + indicator.slice(1).toLowerCase();
}

/** Tailwind background class for a chronology indicator's status dot/icon. Exact
 * same palette the incident card's timeline dot uses, so form and card agree. */
export function indicatorDotClass(indicator: ChronologyIndicator): string {
  const dots: Record<ChronologyIndicator, string> = {
    GREEN: "bg-emerald-500",
    RED: "bg-red-500",
    BLUE: "bg-blue-500",
    GRAY: "bg-neutral-400",
  };
  return dots[indicator] ?? "bg-neutral-400";
}
