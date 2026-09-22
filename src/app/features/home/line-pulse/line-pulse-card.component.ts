import { Component, computed, inject, input } from "@angular/core";
import { LineStatusBadge } from "../../../domain-ui/line-status-badge/line-status-badge";
import { HlmBadge } from "../../../ui/badge/badge";
import { HlmButton } from "../../../ui/button/button";
import { faviconHostnameOf } from "../../insiden/data/social-link.util";
import { humanizeSince } from "../../spotting/data/humanize-since.util";
import { ReportSheetService } from "../../spotting/data/report-sheet.service";
import { LinePulse } from "../data/home.queries";
import { LineStatusSheetService } from "../data/line-status-sheet.service";
import { passengerLabel, passengerVariant } from "../data/passenger-status.util";
import { lineStatusInfo, passengerInfo, passengerScale } from "../data/status-info.util";
import { StatusInfoChipComponent } from "./status-info-chip.component";

/** Related links are a supporting signal on the card — never a feed of their own. */
const MAX_PULSE_LINKS = 5;

/**
 * The per-line pulse card of the community front page: what a line looks like right now
 * (vehicle counts + passenger status + the backend's consolidated message + the social
 * entries behind it) plus the two actions that keep the data fresh — "Submit line status"
 * (mobile LineStatusSheetComponent via LineStatusSheetService) and "Add spotting entry"
 * (ReportSheetService, whose sheet the home page hosts).
 *
 * Both status chips carry a hover/tap info popover (StatusInfoChipComponent). Mobile-first:
 * the card is a single column with full-width actions; from `sm:` the actions move to the
 * right of the title row. Links are plain anchors (compact) rather than link cards.
 */
@Component({
  selector: "app-line-pulse-card",
  imports: [HlmBadge, HlmButton, LineStatusBadge, StatusInfoChipComponent],
  template: `
    <section
      class="bg-card text-card-foreground border-border flex flex-col gap-3 rounded-xl border p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between sm:gap-4"
    >
      <div class="flex min-w-0 flex-col gap-3 sm:flex-1">
        <header class="flex items-center gap-3">
          <span
            class="border-border size-3 shrink-0 rounded-full border"
            [style.background-color]="line().displayColor"
            aria-hidden="true"
          ></span>
          <div class="min-w-0 flex-1">
            <h3 class="truncate text-base font-semibold">
              <span class="text-muted-foreground">{{ line().code }}</span>
              · {{ line().displayName }}
            </h3>
            <div class="mt-1.5 flex flex-wrap items-center gap-2">
              <app-status-info-chip [info]="lineStatusInfo(line().status)">
                <line-status-badge [status]="line().status" />
              </app-status-info-chip>
              <app-status-info-chip
                [info]="passengerInfo(line().passengerStatus)"
                [scale]="passengerScale(line().passengerStatus)"
              >
                <span
                  hlmBadge
                  data-testid="passenger-status"
                  [variant]="passengerVariant(line().passengerStatus)"
                >
                  {{ passengerLabel(line().passengerStatus) }}
                </span>
              </app-status-info-chip>
            </div>
          </div>
        </header>

        <p class="text-sm font-medium" data-testid="line-vehicle-count">
          {{ line().inServiceVehicleCount }} of {{ line().totalVehicleCount }} vehicles in service
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
      </div>

      <div class="flex flex-col gap-2 sm:shrink-0 sm:flex-row sm:items-start">
        <button
          hlmBtn
          data-testid="submit-line-status"
          class="h-11 w-full text-base sm:w-auto"
          (click)="sheet.openFor(line().id)"
        >
          Submit line status
        </button>
        <button
          hlmBtn
          variant="outline"
          data-testid="add-spotting-entry"
          class="h-11 w-full text-base sm:w-auto"
          (click)="reportSheet.openFor(line().id)"
        >
          Add spotting entry
        </button>
      </div>
    </section>
  `,
})
export class LinePulseCardComponent {
  readonly line = input.required<LinePulse>();

  protected readonly sheet = inject(LineStatusSheetService);
  protected readonly reportSheet = inject(ReportSheetService);

  protected readonly passengerLabel = passengerLabel;
  protected readonly passengerVariant = passengerVariant;
  protected readonly passengerInfo = passengerInfo;
  protected readonly passengerScale = passengerScale;
  protected readonly lineStatusInfo = lineStatusInfo;
  protected readonly _humanizeSince = humanizeSince;
  protected readonly _hostname = faviconHostnameOf;

  protected readonly _links = computed(() => this.line().pulseLinks.slice(0, MAX_PULSE_LINKS));
}
