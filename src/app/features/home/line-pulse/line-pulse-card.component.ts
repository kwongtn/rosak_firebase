import { Component, computed, inject, input } from "@angular/core";
import { LineStatusBadge } from "../../../domain-ui/line-status-badge/line-status-badge";
import { HlmBadge } from "../../../ui/badge/badge";
import { HlmButton } from "../../../ui/button/button";
import { faviconHostnameOf } from "../../insiden/data/social-link.util";
import { humanizeSince } from "../../spotting/data/humanize-since.util";
import { LinePulse } from "../data/home.queries";
import { LineStatusSheetService } from "../data/line-status-sheet.service";
import { passengerLabel, passengerVariant } from "../data/passenger-status.util";

/** Related links are a supporting signal on the card — never a feed of their own. */
const MAX_PULSE_LINKS = 5;

/**
 * The per-line pulse card of the community front page: what a line looks like right now
 * (vehicle counts + passenger status + the backend's consolidated message + the social
 * entries behind it) plus the one action that keeps the data fresh — "Submit line status",
 * which opens the mobile LineStatusSheetComponent through LineStatusSheetService.
 *
 * Mobile-first: the card is a single column, the submit target is ≥44px, and links are plain
 * anchors (compact) rather than the heavier link-card composition.
 */
@Component({
  selector: "app-line-pulse-card",
  imports: [HlmBadge, HlmButton, LineStatusBadge],
  template: `
    <section
      class="bg-card text-card-foreground border-border flex flex-col gap-3 rounded-xl border p-4 shadow-sm"
    >
      <header class="flex items-start gap-3">
        <span
          class="border-border mt-1 size-3 shrink-0 rounded-full border"
          [style.background-color]="line().displayColor"
          aria-hidden="true"
        ></span>
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-base font-semibold">
            <span class="text-muted-foreground">{{ line().code }}</span>
            · {{ line().displayName }}
          </h3>
          <div class="mt-1.5 flex flex-wrap items-center gap-2">
            <line-status-badge [status]="line().status" />
            <span
              hlmBadge
              data-testid="passenger-status"
              [variant]="passengerVariant(line().passengerStatus)"
            >
              {{ passengerLabel(line().passengerStatus) }}
            </span>
          </div>
        </div>
      </header>

      <p class="text-sm font-medium" data-testid="line-vehicle-count">
        {{ line().inServiceVehicleCount }} of {{ line().totalVehicleCount }} in service
      </p>

      @if (line().passengerStatusMessage; as message) {
        <p
          class="bg-muted text-muted-foreground rounded-lg p-3 text-sm"
          data-testid="line-pulse-message"
        >
          {{ message }}
        </p>
      }

      @if (_links().length > 0) {
        <ul class="flex flex-col gap-1.5">
          @for (link of _links(); track link.id) {
            <li>
              <a
                [href]="link.url"
                target="_blank"
                rel="noopener noreferrer"
                class="border-border hover:bg-muted/40 flex min-h-11 items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors"
              >
                @if (_hostname(link.url); as domain) {
                  <img
                    [src]="'https://www.google.com/s2/favicons?domain=' + domain"
                    class="size-4 shrink-0 rounded-sm"
                    alt=""
                  />
                }
                <span class="min-w-0 flex-1 truncate">
                  {{ link.title || _hostname(link.url) || link.url }}
                </span>
                <span class="text-muted-foreground shrink-0 text-xs whitespace-nowrap">
                  {{ _humanizeSince(link.created) }}
                </span>
              </a>
            </li>
          }
        </ul>
      }

      <button
        hlmBtn
        data-testid="submit-line-status"
        class="h-11 w-full text-base"
        (click)="sheet.openFor(line().id)"
      >
        Submit line status
      </button>
    </section>
  `,
})
export class LinePulseCardComponent {
  readonly line = input.required<LinePulse>();

  protected readonly sheet = inject(LineStatusSheetService);

  protected readonly passengerLabel = passengerLabel;
  protected readonly passengerVariant = passengerVariant;
  protected readonly _humanizeSince = humanizeSince;
  protected readonly _hostname = faviconHostnameOf;

  protected readonly _links = computed(() => this.line().pulseLinks.slice(0, MAX_PULSE_LINKS));
}
