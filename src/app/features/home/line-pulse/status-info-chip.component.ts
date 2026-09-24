import { Component, computed, input } from "@angular/core";
import { HlmBadge } from "../../../ui/badge/badge";
import { InfoPopover, type InfoPopoverLink } from "../../../ui/info-popover/info-popover";
import type { StatusInfo, StatusScaleEntry } from "../data/status-info.util";

/** One row of an extra per-category breakdown inside the popover (e.g. per-status vehicle counts). */
export interface StatusBreakdownRow {
  key: string;
  label: string;
  value: string;
}

/**
 * The home status chip: a status badge wrapped in the shared `app-info-popover`, which owns every
 * part of the open/close behaviour that is easy to get subtly wrong (hover/focus vs tap, Escape,
 * outside-click, focus return, SSR-safe panel id). This wrapper owns only the feature's extra
 * blocks — the rolling window, the consolidated community message, the per-category breakdown and
 * the severity legend — projected into the shared panel's `popoverExtra` slot.
 */
@Component({
  selector: "app-status-info-chip",
  imports: [HlmBadge, InfoPopover],
  template: `
    <app-info-popover
      [label]="info().title"
      [content]="info().body"
      [link]="_methodologyLink()"
      testId="status-info-popover"
    >
      <ng-content />
      <div popoverExtra>
        @if (windowMinutes(); as minutes) {
          <p class="text-muted-foreground mt-3" data-testid="status-window">
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
        @if (scale().length > 0) {
          <ul class="border-border mt-2.5 flex flex-col gap-1 border-t pt-2.5">
            @for (entry of scale(); track entry.key) {
              <li
                class="flex items-center justify-between gap-1.5"
                data-testid="status-scale-entry"
                [attr.data-active]="entry.active"
                [class.opacity-50]="!entry.active"
              >
                <span class="flex items-center gap-1.5">
                  <span
                    class="size-2.5 p-0"
                    hlmBadge
                    [variant]="entry.variant"
                    aria-hidden="true"
                  ></span>
                  <span [class.font-medium]="entry.active">{{ entry.label }}</span>
                </span>
                @if (entry.count) {
                  <span
                    class="text-muted-foreground tabular-nums"
                    data-testid="status-scale-count"
                    [class.font-medium]="entry.active"
                  >
                    ({{ entry.count }})
                  </span>
                }
              </li>
            }
          </ul>
        }
      </div>
    </app-info-popover>
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
  /** Methodology section anchor this chip's popover deep-links to (`/methodology#<id>`). */
  readonly linkFragment = input("line-status");

  /** Deep link to the methodology section that owns this chip's metric. */
  protected readonly _methodologyLink = computed<InfoPopoverLink>(() => ({
    text: "How this is counted",
    routerLink: "/methodology",
    fragment: this.linkFragment(),
  }));
}
