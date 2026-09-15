import { computed, signal, type Signal, type WritableSignal } from "@angular/core";

export interface BulkActions {
  /** Whether bulk-select mode is active. */
  readonly selectMode: WritableSignal<boolean>;
  /** The set of currently checked ids. */
  readonly checkedIds: WritableSignal<Set<string>>;
  /** Number of checked ids. */
  readonly checkedCount: Signal<number>;
  /** Toggle bulk-select mode on/off, clearing any checked ids. */
  toggleSelectMode(): void;
  /** Toggle a single id in the checked set. */
  toggleChecked(id: string): void;
  /** Clear all checked ids. */
  clearSelection(): void;
}

/**
 * Reusable bulk-action state: a `selectMode` toggle plus a `Set<string>` of checked ids.
 * Extracted from the console's mark-as-read flow so any admin/list view (console, profile
 * spotting entries, future lists) gets the same three signals + actions for free.
 */
export function useBulkActions(): BulkActions {
  const selectMode = signal(false);
  const checkedIds = signal<Set<string>>(new Set());
  const checkedCount = computed(() => checkedIds().size);

  function toggleSelectMode(): void {
    selectMode.update((v) => !v);
    checkedIds.set(new Set());
  }

  function toggleChecked(id: string): void {
    checkedIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function clearSelection(): void {
    checkedIds.set(new Set());
  }

  return { selectMode, checkedIds, checkedCount, toggleSelectMode, toggleChecked, clearSelection };
}
