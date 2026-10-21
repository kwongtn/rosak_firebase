import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  TemplateRef,
} from "@angular/core";
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

let nextComboboxId = 0;

/**
 * A minimal searchable single-select, built directly (not on spartan-ng's Brain combobox,
 * whose generic multi-mode abstraction is more machinery than this app's one real use case —
 * the spotting-report vehicle picker — needs). Filters client-side over an already-fetched
 * item list; no virtualization, since the lists involved (a line's vehicle roster) are small.
 *
 * Follows the ARIA editable-combobox pattern with list autocomplete: the input is the
 * `role="combobox"` and keeps DOM focus; the highlighted row is exposed through
 * `aria-activedescendant`, not by moving focus. Escape closes an open list and stops there, but a
 * closed combobox lets it through, so Escape inside a sheet still closes the sheet.
 */
@Component({
  selector: "hlm-combobox",
  imports: [HlmInput, NgTemplateOutlet],
  host: { class: "relative block" },
  template: `
    <input
      hlmInput
      type="text"
      role="combobox"
      aria-autocomplete="list"
      [class]="_inputClass()"
      [placeholder]="placeholder()"
      [attr.aria-label]="ariaLabel() ?? null"
      [attr.aria-expanded]="_listVisible()"
      [attr.aria-controls]="_listboxId"
      [attr.aria-activedescendant]="_activeOptionId()"
      [value]="search()"
      (input)="_onInput($event)"
      (click)="_onClick($event)"
      (blur)="_onBlur()"
      (keydown.arrowdown)="_moveHighlight(1); $event.preventDefault()"
      (keydown.arrowup)="_moveHighlight(-1); $event.preventDefault()"
      (keydown.enter)="_selectHighlighted(); $event.preventDefault()"
      (keydown.escape)="_onEscape($event)"
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
    @if (trailingTemplate(); as trailing) {
      <span class="pointer-events-none absolute top-1/2 right-7 -translate-y-1/2">
        <ng-container *ngTemplateOutlet="trailing" />
      </span>
    }
    @if (_listVisible()) {
      <ul
        role="listbox"
        [id]="_listboxId"
        [attr.aria-label]="ariaLabel() ?? null"
        class="bg-popover text-popover-foreground border-border absolute z-50 mt-1 max-h-64 w-max min-w-full overflow-x-clip overflow-y-auto rounded-lg border py-1 shadow-md"
        [class.max-w-full]="constrainWidth()"
      >
        @for (item of _filtered(); track item.value) {
          <li
            role="option"
            [id]="_optionId($index)"
            [attr.aria-selected]="$index === _highlightIndex()"
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
    <span class="sr-only" role="status">{{ _statusText() }}</span>
  `,
})
export class HlmCombobox<T> {
  readonly userClass = input<string>("", { alias: "class" });
  readonly items = model<ComboboxItem<T>[]>([]);
  readonly value = model<T | undefined>(undefined);
  readonly placeholder = model<string>("");
  /** Accessible name for the field's input. Callers whose visible field text is a plain layout
   * element (not a wrapping <label>) pass that text here so the input keeps its name. */
  readonly ariaLabel = input<string | undefined>(undefined, { alias: "aria-label" });
  /** Overrides the default label/searchTerms substring match — for lookups where what the
   * user types doesn't literally appear in the item (e.g. a run-number → unit-ID heuristic). */
  readonly filterFn = model<
    ((items: ComboboxItem<T>[], query: string) => ComboboxItem<T>[]) | undefined
  >(undefined);
  /** Custom row content — receives the `ComboboxItem` as `$implicit`. Falls back to plain label text. */
  readonly itemTemplate = model<TemplateRef<{ $implicit: ComboboxItem<T> }> | undefined>(undefined);
  /** Optional trailing content rendered inside the field, right-aligned just before the
   * dropdown chevron — e.g. the selected item's status badge. Purely decorative:
   * `pointer-events-none`, so clicks still land on the input. While a trailing template is
   * present the input reserves extra right padding so its text never runs underneath. */
  readonly trailingTemplate = model<TemplateRef<unknown> | undefined>(undefined);
  /** Shown when typed text matches nothing — callers should say what's actually being searched
   * (e.g. "No matching vehicles") rather than leave this at its generic default. */
  readonly emptyMessage = input<string>("No matching options");
  /** Caps the dropdown at the field's own width instead of its content's (`w-max`). Set this for
   * comboboxes inside a sheet: an over-wide list adds a horizontal scrollbar to the sheet body. */
  readonly constrainWidth = input(false);

  /** Value written when the user empties the field. Defaults to "nothing selected"
   * (`undefined`); a string-typed form field must pass `""` instead, because Signal Forms
   * drops a field node whose model value becomes `undefined` while its control is rendered. */
  readonly emptyValue = input<T | undefined>(undefined);

  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Unique per instance: the input's `aria-controls` / `aria-activedescendant` point at these ids. */
  protected readonly _listboxId = `hlm-combobox-${nextComboboxId++}`;

  readonly search = signal("");
  protected readonly _isOpen = signal(false);
  protected readonly _highlightIndex = signal(0);
  /** False while `search()` is still just the pre-filled label of whatever's already selected
   * (or blank) rather than something the user actually typed — `_filtered()` ignores `search()`
   * entirely in that state, so opening the dropdown always shows the full list first, like a
   * native <select>, rather than "filtering" against the current selection's own label (which
   * would otherwise make the list look empty/wrong the moment you click a filled-in combobox). */
  protected readonly _hasTypedSinceOpen = signal(false);
  /** True once the user deliberately moves the highlight with ArrowUp/ArrowDown since the panel
   * opened. `_highlightIndex` alone can't express this: after the field is cleared `_filtered()`
   * returns the whole unfiltered list and index 0 is a real (wrong) item, so "highlight is at 0"
   * must not be read as "the user chose item 0". `_selectHighlighted` requires this (or a
   * non-empty query) before it will commit anything. */
  protected readonly _hasMovedHighlight = signal(false);

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

  /** The listbox is in the DOM: open with at least one match (the empty-state message is not a
   * listbox, so it does not count as expanded). */
  protected readonly _listVisible = computed(() => this._isOpen() && this._filtered().length > 0);

  /** Polite live-region text: how many rows the open list offers; empty while closed. */
  protected readonly _statusText = computed(() => {
    if (!this._isOpen()) return "";
    const count = this._filtered().length;
    return count === 1 ? "1 result" : `${count} results`;
  });

  /** Id of the row the highlight sits on — what a screen reader should treat as the focused option. */
  protected readonly _activeOptionId = computed(() =>
    this._listVisible() && this._highlightIndex() < this._filtered().length
      ? this._optionId(this._highlightIndex())
      : null,
  );

  /** The input always clears the chevron (pr-6); when trailing content is present it also
   * clears that content (pr-36 ≈ chevron + the widest status badge) so text never runs under it. */
  protected readonly _inputClass = computed(
    () => (this.trailingTemplate() ? "pr-36 " : "pr-6 ") + this.userClass(),
  );

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
    // `undefined` means "nothing selected" (e.g. the user emptied the field — see `_onInput`).
    // Never look it up in `items()`: an item could itself hold `undefined`, and a match here
    // would resurrect its label over a field the user just cleared.
    if (value === undefined) {
      this.search.set("");
      return;
    }
    const match = this.items().find((item) => item.value === value);
    this.search.set(match ? match.label : "");
  }

  protected _onClick(event: MouseEvent): void {
    this._isOpen.set(true);
    this._hasTypedSinceOpen.set(false);
    this._hasMovedHighlight.set(false);
    // Selects the pre-filled text so the very first keystroke replaces it outright, instead
    // of inserting at whatever the cursor position happens to be.
    (event.currentTarget as HTMLInputElement).select();
  }

  protected _onInput(event: Event): void {
    this._hasTypedSinceOpen.set(true);
    this._isOpen.set(true);
    this._highlightIndex.set(0);
    this._hasMovedHighlight.set(false);
    const text = (event.target as HTMLInputElement).value;
    this.search.set(text);
    // Emptying the field deselects: `value` is what the form/`(valueChange)` actually holds, so
    // leaving it set lets `_syncSearchToValue` re-fill the old label on blur (the field looks
    // like it reselected itself while still submitting the old id). A non-empty query must
    // never clear it — that would drop the selection mid-search.
    if (text.trim() === "") {
      this.value.set(this.emptyValue());
    }
  }

  protected _moveHighlight(delta: number): void {
    const count = this._filtered().length;
    if (count === 0) return;
    this._hasMovedHighlight.set(true);
    if (!this._isOpen()) {
      this._isOpen.set(true);
      this._highlightIndex.set(0);
      return;
    }
    this._highlightIndex.set((this._highlightIndex() + delta + count) % count);
    // The row already exists here (the list was open), so it can be scrolled to before the next
    // render; a just-opened list sits at index 0, which is already at the top.
    this._host.nativeElement
      .querySelector<HTMLElement>(`#${this._optionId(this._highlightIndex())}`)
      // Optional call: jsdom has no scrollIntoView.
      ?.scrollIntoView?.({ block: "nearest" });
  }

  protected _optionId(index: number): string {
    return `${this._listboxId}-option-${index}`;
  }

  /** Only an open list consumes Escape. An open one must stop it: the enclosing sheet listens for
   * Escape on `document`, so the keypress that dismissed the dropdown would also close the sheet
   * and discard what the rider typed. A closed one lets it bubble, so Escape still closes the sheet. */
  protected _onEscape(event: Event): void {
    if (!this._isOpen()) return;
    event.stopPropagation();
    this._isOpen.set(false);
  }

  protected _selectHighlighted(): void {
    if (!this._isOpen()) return;
    // Enter commits only what the user actually chose: a deliberately ArrowUp/ArrowDown-ed row,
    // or a non-empty query's highlighted match. After the field is cleared the query is empty and
    // no row was navigated to, so Enter is a no-op (the panel stays open) rather than silently
    // re-committing `_filtered()[_highlightIndex()]` from the now-unfiltered list — the bug
    // where a deselected field "reselects itself".
    const query = this._hasTypedSinceOpen() ? this.search().trim() : "";
    if (!this._hasMovedHighlight() && !query) return;
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
