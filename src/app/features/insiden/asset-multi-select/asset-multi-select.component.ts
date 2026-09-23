import { Component, computed, model, input, signal } from "@angular/core";
import { HlmInput } from "../../../ui/input/input";
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";

export interface AssetMultiSelectOption {
  id: string;
  label: string;
  /** Parent line codes rendered muted in brackets after the label, e.g. ["KJL", "MRL"]. */
  parentCodes?: string[];
}

/** Chip label for a parent line code: its last segment, e.g. "KTMK-PKL" → "PKL" and
 * "KTM ETS" → "ETS". The full code stays available via the chip's `title` (hover). */
export function parentCodeChipText(code: string): string {
  const segments = code.split(/[^a-zA-Z0-9]+/).filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? code;
}

/**
 * Shared searchable checkbox list for tagging an incident/link with the lines, vehicles or
 * stations it affects. Both incident-form and link-form used to copy-paste this exact
 * checkbox-list markup three times each (lines/vehicles/stations); this component is the
 * single implementation. Search exists because the vehicle/station rosters can be long
 * (dozens of entries per line), and `parentCodes` lets a vehicle or station that belongs to
 * multiple lines be found by typing any of its parent line codes (e.g. "KJL").
 */
@Component({
  selector: "app-asset-multi-select",
  imports: [HlmInput, HlmSkeleton],
  host: {
    "[class.flex]": "fillHeight()",
    "[class.flex-col]": "fillHeight()",
    "[class.min-h-0]": "fillHeight()",
  },
  template: `
    <div
      class="flex flex-col gap-1.5 text-sm"
      [class.flex-1]="fillHeight()"
      [class.min-h-0]="fillHeight()"
    >
      <span class="flex items-baseline gap-1">
        {{ heading() }}
        @if (optional()) {
          <span class="text-muted-foreground text-xs whitespace-nowrap">(optional)</span>
        }
      </span>

      <input
        hlmInput
        type="text"
        class="h-7 text-xs"
        [placeholder]="searchPlaceholder()"
        [attr.aria-label]="heading()"
        [value]="searchText()"
        (input)="_onSearchInput($event)"
      />

      <div
        class="border-border flex flex-col gap-0.5 overflow-y-auto rounded-lg border p-1.5"
        data-testid="asset-option-list"
        [class.max-h-44]="!fillHeight()"
        [class.max-h-none]="fillHeight()"
        [class.flex-1]="fillHeight()"
        [class.min-h-0]="fillHeight()"
      >
        @if (isLoading()) {
          <div hlmSkeleton class="h-4 w-full"></div>
          <div hlmSkeleton class="h-4 w-4/5"></div>
          <div hlmSkeleton class="h-4 w-3/5"></div>
        } @else {
          @for (option of filteredOptions(); track option.id) {
            <label
              class="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm"
            >
              <input
                type="checkbox"
                class="size-4 accent-primary"
                [checked]="isSelected(option.id)"
                (change)="toggle(option.id)"
              />
              <span class="min-w-0 flex-1 truncate" [title]="_fullText(option)">
                {{ option.label }}
              </span>
              @if (option.parentCodes && option.parentCodes.length > 0) {
                @if (chipParentCodes()) {
                  <span class="flex shrink-0 flex-wrap gap-1">
                    @for (code of option.parentCodes; track code) {
                      <span
                        class="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] leading-none"
                        [title]="code"
                      >
                        {{ parentCodeChipText(code) }}
                      </span>
                    }
                  </span>
                } @else {
                  <span
                    class="text-muted-foreground min-w-0 max-w-24 shrink-0 truncate text-xs"
                    [title]="_codesText(option)"
                  >
                    ({{ _codesText(option) }})
                  </span>
                }
              }
            </label>
          } @empty {
            @if (searchText().trim().length > 0) {
              <p class="text-muted-foreground text-xs">
                No matches for "{{ searchText().trim() }}".
              </p>
            } @else {
              <p class="text-muted-foreground text-xs">{{ emptyMessage() }}</p>
            }
          }
        }
      </div>
    </div>
  `,
})
export class AssetMultiSelectComponent {
  readonly heading = input.required<string>();
  readonly optional = input(false);
  readonly options = input.required<AssetMultiSelectOption[]>();
  readonly selectedIds = model.required<string[]>();
  readonly isLoading = input(false);
  readonly emptyMessage = input("No options available.");
  readonly searchPlaceholder = input("Search");
  /** Selected options float to the top of the list, keeping their original order within
   * each group; deselecting drops them back to their default position. */
  readonly pinnedSelected = input(false);
  /** Render `parentCodes` as caret chips showing only each code's last segment, with the
   * full code on hover (via `title`) — replaces the muted "(…)" bracket text. */
  readonly chipParentCodes = input(false);
  /** Fill the parent's remaining height instead of capping the list at `max-h-44` — the caller
   * sizes the host (`flex-1 min-h-0`) and this component turns itself into the flex column that
   * lets the option list take what's left. The list keeps its own scrolling, so a hosting sheet
   * body never has to scroll instead. */
  readonly fillHeight = input(false);

  protected readonly searchText = signal("");

  protected readonly parentCodeChipText = parentCodeChipText;

  protected readonly filteredOptions = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    const all = this.options();
    const matched = query
      ? all.filter(
          (option) =>
            option.label.toLowerCase().includes(query) ||
            (option.parentCodes ?? []).some((code) => code.toLowerCase().includes(query)),
        )
      : all;
    if (!this.pinnedSelected()) {
      return matched;
    }
    return [
      ...matched.filter((option) => this.isSelected(option.id)),
      ...matched.filter((option) => !this.isSelected(option.id)),
    ];
  });

  protected _onSearchInput(event: Event): void {
    this.searchText.set((event.target as HTMLInputElement).value);
  }

  protected isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  protected toggle(id: string): void {
    this.selectedIds.update((current) =>
      current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id],
    );
  }

  protected _codesText(option: AssetMultiSelectOption): string {
    return (option.parentCodes ?? []).join(", ");
  }

  protected _fullText(option: AssetMultiSelectOption): string {
    const codes = this._codesText(option);
    return codes ? `${option.label} (${codes})` : option.label;
  }
}
