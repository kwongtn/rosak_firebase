import { Component, input, output, signal } from "@angular/core";
import { LineStatusBadge } from "../../../../domain-ui/line-status-badge/line-status-badge";
import { Line } from "../../data/spotting.queries";

/**
 * Mobile replacement for the line pill-nav: a tap-to-open listbox rather than a native `<select>`
 * because a native `<option>` can't render a status badge — this needs to show each line's
 * status alongside its name, same as the desktop nav. The closed button doubles as the page
 * title on small screens, where the separate `<h1>` is hidden.
 */
@Component({
  selector: "app-line-switcher",
  imports: [LineStatusBadge],
  host: { class: "relative block" },
  template: `
    <button
      type="button"
      class="border-border flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left"
      (click)="_isOpen.set(!_isOpen())"
      (blur)="_onBlur()"
    >
      @if (currentLine(); as line) {
        <span class="flex items-center gap-2">
          <span class="text-xl font-semibold">{{ line.displayName }}</span>
          <line-status-badge [status]="line.status" />
        </span>
      } @else {
        <span class="text-muted-foreground">Select a line</span>
      }
      <span class="text-muted-foreground shrink-0">▾</span>
    </button>
    @if (_isOpen()) {
      <ul
        class="bg-popover text-popover-foreground border-border absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border py-1 shadow-md"
      >
        @for (line of lines(); track line.id) {
          <li>
            <button
              type="button"
              class="hover:bg-muted flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
              [class.bg-muted]="line.id === currentLine()?.id"
              (click)="_select(line)"
            >
              <span>{{ line.code }} — {{ line.displayName }}</span>
              <line-status-badge [status]="line.status" />
            </button>
          </li>
        }
      </ul>
    }
  `,
})
export class LineSwitcherComponent {
  readonly lines = input.required<Line[]>();
  readonly currentLine = input<Line | undefined>(undefined);
  readonly lineSelected = output<string>();

  protected readonly _isOpen = signal(false);

  protected _select(line: Line): void {
    this._isOpen.set(false);
    this.lineSelected.emit(line.id);
  }

  protected _onBlur(): void {
    // Deferred so a (click) selection on a list item registers before we close the list.
    setTimeout(() => this._isOpen.set(false), 100);
  }
}
