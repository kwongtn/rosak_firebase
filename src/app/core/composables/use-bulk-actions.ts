import { computed, signal, type Signal, type WritableSignal } from "@angular/core";

interface BulkActions {
  /** The set of currently checked ids. */
  readonly checkedIds: WritableSignal<Set<string>>;
  /** Number of checked ids. */
  readonly checkedCount: Signal<number>;
  /**
   * The last non-shift-clicked id — the anchor a shift-click range runs from.
   * `null` means "no anchor", so a shift-click only affects the clicked row.
   */
  readonly anchorId: Signal<string | null>;
  /** Toggle a single id and make it the new range anchor. */
  toggleChecked(id: string): void;
  /**
   * Apply `targetState` to the inclusive range between the anchor and `targetId`
   * (in `orderedIds` order). The range is inclusive of the anchor row's STATE — its
   * tick is overwritten like any other row's — but the anchor POINTER is not moved
   * onto `targetId`, so a repeated shift-click re-ranges from the same row; the anchor
   * is dropped only if the selection empties.
   */
  toggleCheckedInRange(orderedIds: readonly string[], targetId: string, targetState: boolean): void;
  /** Clear all checked ids and the anchor. */
  clearSelection(): void;
  /** Drop the anchor without touching the checked ids (list was reloaded/re-ordered). */
  resetAnchor(): void;
}

/**
 * Pure core of the shift-click range: returns a NEW set with `targetState` applied to
 * every id between `anchorId` and `targetId` inclusive, in `orderedIds` order.
 *
 * Degenerate cases deliberately degrade to a single-row toggle rather than throwing:
 * no anchor yet, or an anchor that is no longer in the list (the page reloaded or
 * re-ordered under the user's feet).
 */
export function toggleCheckedRange(
  checked: ReadonlySet<string>,
  orderedIds: readonly string[],
  anchorId: string | null,
  targetId: string,
  targetState: boolean,
): Set<string> {
  const next = new Set(checked);
  const targetIndex = orderedIds.indexOf(targetId);
  const anchorIndex = anchorId === null ? -1 : orderedIds.indexOf(anchorId);
  if (targetIndex === -1) {
    return next;
  }
  const from = anchorIndex === -1 ? targetIndex : Math.min(anchorIndex, targetIndex);
  const to = anchorIndex === -1 ? targetIndex : Math.max(anchorIndex, targetIndex);
  for (let i = from; i <= to; i++) {
    const id = orderedIds[i];
    if (targetState) {
      next.add(id);
    } else {
      next.delete(id);
    }
  }
  return next;
}

/**
 * Reusable bulk-action state: a `Set<string>` of checked ids, the last-clicked anchor, and
 * single/range selection actions. Extracted from the console's mark-as-read flow so any
 * admin/list view (console, profile spotting entries, future lists) gets the same selection
 * plumbing for free. Every mutation returns a new Set — the old one is never mutated in
 * place, so `computed()` projections stay honest.
 */
export function useBulkActions(): BulkActions {
  const checkedIds = signal<Set<string>>(new Set());
  const checkedCount = computed(() => checkedIds().size);
  const anchorId = signal<string | null>(null);

  /** An emptied selection has no meaningful anchor left to range from. */
  function setChecked(next: Set<string>): void {
    checkedIds.set(next);
    if (next.size === 0) {
      anchorId.set(null);
    }
  }

  function toggleChecked(id: string): void {
    const next = new Set(checkedIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    anchorId.set(id);
    setChecked(next);
  }

  function toggleCheckedInRange(
    orderedIds: readonly string[],
    targetId: string,
    targetState: boolean,
  ): void {
    setChecked(toggleCheckedRange(checkedIds(), orderedIds, anchorId(), targetId, targetState));
  }

  function clearSelection(): void {
    anchorId.set(null);
    checkedIds.set(new Set());
  }

  function resetAnchor(): void {
    anchorId.set(null);
  }

  return {
    checkedIds,
    checkedCount,
    anchorId,
    toggleChecked,
    toggleCheckedInRange,
    clearSelection,
    resetAnchor,
  };
}
