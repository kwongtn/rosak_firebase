import { Component, computed, effect, input, model, signal, TemplateRef } from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { HlmInput } from "../input/input";

export interface ComboboxItem<T, TMeta = unknown> {
  label: string;
  value: T;
  /** Extra text to search against besides `label` (e.g. an alternate/heuristic match). */
  searchTerms?: string[];
  /** Arbitrary extra data available to a custom `itemTemplate` (e.g. a status to badge). */
  meta?: TMeta;
}

/**
 * A minimal searchable single-select, built directly (not on spartan-ng's Brain combobox,
 * whose generic multi-mode abstraction is more machinery than this app's one real use case —
 * the spotting-report vehicle picker — needs). Filters client-side over an already-fetched
 * item list; no virtualization, since the lists involved (a line's vehicle roster) are small.
 */
@Component({
  selector: "hlm-combobox",
  imports: [HlmInput, NgTemplateOutlet],
  host: { class: "relative block" },
  template: `
    <input
      hlmInput
      type="text"
      [class]="'pr-6 ' + userClass()"
      [placeholder]="placeholder()"
      [value]="search()"
      (input)="_onInput($event)"
      (focus)="_onFocus($event)"
      (blur)="_onBlur()"
      (keydown.arrowdown)="_moveHighlight(1); $event.preventDefault()"
      (keydown.arrowup)="_moveHighlight(-1); $event.preventDefault()"
      (keydown.enter)="_selectHighlighted(); $event.preventDefault()"
      (keydown.escape)="_isOpen.set(false)"
    />
    <!-- Purely decorative (pointer-events-none) — the same select-style affordance a native
             <select> shows, so this reads as "a dropdown" rather than a plain text field even
             before it's been touched. Clicking through it still lands on the input underneath. -->
    <svg
      class="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      aria-hidden="true"
    >
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6" />
    </svg>
    @if (_isOpen() && _filtered().length > 0) {
      <ul
        class="bg-popover text-popover-foreground border-border absolute z-50 mt-1 max-h-64 w-max min-w-full overflow-x-clip overflow-y-auto rounded-lg border py-1 shadow-md"
      >
        @for (item of _filtered(); track item.value) {
          <li
            class="hover:bg-muted flex cursor-pointer items-center px-2.5 py-1.5 text-sm"
            [class.bg-muted]="$index === _highlightIndex()"
            (mousedown)="_select(item)"
          >
            @if (itemTemplate()) {
              <ng-container *ngTemplateOutlet="itemTemplate()!; context: { $implicit: item }" />
            } @else {
              {{ item.label }}
            }
          </li>
        }
      </ul>
    } @else if (_isOpen() && _hasTypedSinceOpen() && search().trim().length > 0) {
      <div
        class="bg-popover text-muted-foreground border-border absolute z-50 mt-1 w-full rounded-lg border px-2.5 py-1.5 text-sm shadow-md"
      >
        {{ emptyMessage() }}
      </div>
    }
  `,
})
export class HlmCombobox<T> {
  readonly userClass = input<string>("", { alias: "class" });
  readonly items = model<ComboboxItem<T>[]>([]);
  readonly value = model<T | undefined>(undefined);
  readonly placeholder = model<string>("");
  /** Overrides the default label/searchTerms substring match — for lookups where what the
   * user types doesn't literally appear in the item (e.g. a run-number → unit-ID heuristic). */
  readonly filterFn = model<
    ((items: ComboboxItem<T>[], query: string) => ComboboxItem<T>[]) | undefined
  >(undefined);
  /** Custom row content — receives the `ComboboxItem` as `$implicit`. Falls back to plain label text. */
  readonly itemTemplate = model<TemplateRef<{ $implicit: ComboboxItem<T> }> | undefined>(undefined);
  /** Shown when typed text matches nothing — callers should say what's actually being searched
   * (e.g. "No matching vehicles") rather than leave this at its generic default. */
  readonly emptyMessage = input<string>("No matching options");

  readonly search = signal("");
  protected readonly _isOpen = signal(false);
  protected readonly _highlightIndex = signal(0);
  /** False while `search()` is still just the pre-filled label of whatever's already selected
   * (or blank) rather than something the user actually typed — `_filtered()` ignores `search()`
   * entirely in that state, so opening the dropdown always shows the full list first, like a
   * native <select>, rather than "filtering" against the current selection's own label (which
   * would otherwise make the list look empty/wrong the moment you click a filled-in combobox). */
  protected readonly _hasTypedSinceOpen = signal(false);

  protected readonly _filtered = computed(() => {
    const query = this._hasTypedSinceOpen() ? this.search().trim().toLowerCase() : "";
    const all = this.items();
    const customFilter = this.filterFn();
    if (customFilter) {
      return customFilter(all, query);
    }
    if (!query) {
      return all;
    }
    return all.filter(
      (item) =>
        item.label.toLowerCase().includes(query) ||
        (item.searchTerms ?? []).some((term) => term.toLowerCase().includes(query)),
    );
  });

  constructor() {
    // Keep the displayed text in sync when `value` changes from outside (e.g. reset by a
    // parent effect when the line changes) — otherwise the input keeps showing stale text
    // for a vehicle that's no longer actually selected.
    effect(() => this._syncSearchToValue());
  }

  /** Resets the displayed text to match whatever's actually selected. Selecting an item already
   * does this itself (via the constructor's effect, since selecting changes `value`), but typed
   * text that never resolved to a selection — an invalid or abandoned search — does not change
   * `value` at all, so nothing else corrects the display back once the user leaves the field;
   * `_onBlur` calls this directly to cover exactly that case. */
  private _syncSearchToValue(): void {
    const value = this.value();
    const match = this.items().find((item) => item.value === value);
    this.search.set(match ? match.label : "");
  }

  protected _onFocus(event: FocusEvent): void {
    this._isOpen.set(true);
    this._hasTypedSinceOpen.set(false);
    // Selects the pre-filled text so the very first keystroke replaces it outright, instead
    // of inserting at whatever the cursor position happens to be.
    (event.target as HTMLInputElement).select();
  }

  protected _onInput(event: Event): void {
    this._hasTypedSinceOpen.set(true);
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected _moveHighlight(delta: number): void {
    const count = this._filtered().length;
    if (count === 0) return;
    this._highlightIndex.set((this._highlightIndex() + delta + count) % count);
  }

  protected _selectHighlighted(): void {
    const item = this._filtered()[this._highlightIndex()];
    if (item) {
      this._select(item);
    }
  }

  protected _select(item: ComboboxItem<T>): void {
    this.value.set(item.value);
    this.search.set(item.label);
    this._isOpen.set(false);
  }

  protected _onBlur(): void {
    // Deferred so a (mousedown) selection on a list item registers before we close the list.
    setTimeout(() => {
      this._isOpen.set(false);
      this._syncSearchToValue();
    }, 100);
  }
}
