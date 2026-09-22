import { isPlatformBrowser } from "@angular/common";
import { Component, PLATFORM_ID, afterNextRender, inject, input, signal } from "@angular/core";
import { HlmBadge } from "../../../ui/badge/badge";
import type {
  PassengerStatusCountRow,
  StatusInfo,
  StatusScaleEntry,
} from "../data/status-info.util";

/** One row of an extra per-category breakdown inside the popover (e.g. per-status vehicle counts). */
export interface StatusBreakdownRow {
  key: string;
  label: string;
  value: string;
}

/**
 * Wraps a status badge with an info popover: hover/focus on desktop, tap on touch. The projected
 * chip stays untouched (its own `data-testid` and text are what tests and the card read), while
 * the popover — including the optional severity legend — renders as a sibling under it.
 *
 * Capability is measured, not guessed, exactly like MySpottingsComponent: a `(hover: hover) and
 * (pointer: fine)` device gets hover/focus; anything else gets a tap toggle.
 */
@Component({
  selector: "app-status-info-chip",
  imports: [HlmBadge],
  template: `
    <span
      class="relative inline-flex"
      role="button"
      tabindex="0"
      [attr.aria-expanded]="_open()"
      (mouseenter)="onMouseEnter()"
      (mouseleave)="onMouseLeave()"
      (focus)="onFocus()"
      (blur)="onBlur()"
      (click)="onClick()"
    >
      <ng-content />
      @if (_open()) {
        <div
          class="bg-popover text-popover-foreground border-border absolute top-full left-0 z-20 mt-1.5 w-64 rounded-lg border p-3 text-left text-xs font-normal whitespace-normal shadow-md"
          data-testid="status-info-popover"
          role="tooltip"
        >
          <p class="font-semibold">{{ info().title }}</p>
          <p class="text-muted-foreground mt-1">{{ info().body }}</p>
          @if (windowMinutes(); as minutes) {
            <p class="text-muted-foreground mt-1" data-testid="status-window">
              Last {{ minutes }} minutes
            </p>
          }
          @if (message(); as consolidated) {
            <p
              class="bg-muted text-muted-foreground mt-2 rounded-md p-2"
              data-testid="status-info-message"
            >
              {{ consolidated }}
            </p>
          }
          @if (breakdown().length > 0) {
            <ul class="border-border mt-2.5 flex flex-col gap-1 border-t pt-2.5">
              @for (row of breakdown(); track row.key) {
                <li
                  class="flex items-center justify-between gap-3"
                  data-testid="status-breakdown-row"
                >
                  <span>{{ row.label }}</span>
                  <span class="text-muted-foreground tabular-nums">{{ row.value }}</span>
                </li>
              }
            </ul>
          }
          @if (statusCounts().length > 0) {
            <ul class="border-border mt-2.5 flex flex-wrap gap-1.5 border-t pt-2.5">
              @for (row of statusCounts(); track row.key) {
                <li hlmBadge [variant]="row.variant" data-testid="status-count-pill">
                  {{ row.label }} ({{ row.count }})
                </li>
              }
            </ul>
          }
          @if (scale().length > 0) {
            <ul class="border-border mt-2.5 flex flex-col gap-1 border-t pt-2.5">
              @for (entry of scale(); track entry.key) {
                <li
                  class="flex items-center gap-1.5"
                  data-testid="status-scale-entry"
                  [attr.data-active]="entry.active"
                  [class.opacity-50]="!entry.active"
                >
                  <span
                    class="size-2.5 p-0"
                    hlmBadge
                    [variant]="entry.variant"
                    aria-hidden="true"
                  ></span>
                  <span [class.font-medium]="entry.active">{{ entry.label }}</span>
                </li>
              }
            </ul>
          }
        </div>
      }
    </span>
  `,
})
export class StatusInfoChipComponent {
  readonly info = input.required<StatusInfo>();
  /** Optional severity legend (e.g. the 7 passenger levels), rendered under the explanation. */
  readonly scale = input<readonly StatusScaleEntry[]>([]);
  /** Optional consolidated message (e.g. "According to 5 social media entries…"). */
  readonly message = input<string | null>(null);
  /** Optional rolling window in minutes, rendered as "Last N minutes". */
  readonly windowMinutes = input<number | null>(null);
  /** Optional per-category rows (e.g. the per-status vehicle counts), under the explanation. */
  readonly breakdown = input<readonly StatusBreakdownRow[]>([]);
  /** Optional per-status report counts (e.g. the passenger severity counts), rendered as pills. */
  readonly statusCounts = input<readonly PassengerStatusCountRow[]>([]);

  protected readonly _open = signal(false);
  /** Measured client-side; defaults to "no hover" (tap toggle) until resolved, the safe default. */
  protected readonly _hoverCapable = signal(false);

  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    if (this._isBrowser) {
      afterNextRender(() => {
        // Some DOM environments (test jsdom) ship no matchMedia — treat that as "no hover".
        if (typeof window.matchMedia === "function") {
          this._hoverCapable.set(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
        }
      });
    }
  }

  protected onMouseEnter(): void {
    if (this._hoverCapable()) {
      this._open.set(true);
    }
  }

  protected onMouseLeave(): void {
    if (this._hoverCapable()) {
      this._open.set(false);
    }
  }

  /** Focus/blur only drive the popover where hover does: on touch, focus() fires before click()
   * and would otherwise fight the tap toggle. */
  protected onFocus(): void {
    if (this._hoverCapable()) {
      this._open.set(true);
    }
  }

  protected onBlur(): void {
    if (this._hoverCapable()) {
      this._open.set(false);
    }
  }

  protected onClick(): void {
    if (!this._hoverCapable()) {
      this._open.update((open) => !open);
    }
  }
}
