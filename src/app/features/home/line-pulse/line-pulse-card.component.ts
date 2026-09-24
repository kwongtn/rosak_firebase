import { Component, computed, inject, input, signal } from "@angular/core";
import {
  metricDoc,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import { LineStatusBadge } from "../../../domain-ui/line-status-badge/line-status-badge";
import { HlmBadge } from "../../../ui/badge/badge";
import { HlmButton } from "../../../ui/button/button";
import { faviconHostnameOf } from "../../insiden/data/social-link.util";
import { humanizeSince } from "../../spotting/data/humanize-since.util";
import { ReportSheetService } from "../../spotting/data/report-sheet.service";
import { LinePulse } from "../data/home.queries";
import { LineStatusSheetService } from "../data/line-status-sheet.service";
import { passengerLabel, passengerVariant } from "../data/passenger-status.util";
import {
  StatusInfo,
  lineStatusInfo,
  passengerInfo,
  passengerScale,
  vehicleStatusRows,
} from "../data/status-info.util";
import { LineStatusChartComponent } from "./line-status-chart.component";
import { LineStatusReportsComponent } from "./line-status-reports.component";
import { StatusInfoChipComponent, StatusBreakdownRow } from "./status-info-chip.component";

/** Related links are a supporting signal on the card — never a feed of their own. */
const MAX_PULSE_LINKS = 5;

/**
 * The per-line pulse card of the community front page: what a line looks like right now
 * (vehicle counts + passenger status + the social entries behind it) plus the two actions that
 * keep the data fresh — "Submit line status" (mobile LineStatusSheetComponent via
 * LineStatusSheetService) and "Add spotting entry" (ReportSheetService, whose sheet the home
 * page hosts).
 *
 * The status chips carry a hover/tap info popover (StatusInfoChipComponent): the vehicle-count
 * pill opens the per-status breakdown, the passenger chip carries the rolling window it covers
 * and the severity legend with the per-status report counts folded in. The line-status pill is
 * rendered only for non-active lines — "Active" is the unremarkable default. The title row is
 * the expand/collapse toggle for the lazy detail panel — the hourly report chart
 * and the recent reports list, both of which only read once expanded. Mobile-first: the card is a
 * single column with full-width, content-sized actions; from `sm:` the actions move to the right
 * of the title row. Links are plain anchors (compact) rather than link cards.
 */
@Component({
  selector: "app-line-pulse-card",
  imports: [
    HlmBadge,
    HlmButton,
    LineStatusBadge,
    LineStatusChartComponent,
    LineStatusReportsComponent,
    StatusInfoChipComponent,
  ],
  template: `
    <section
      class="bg-card text-card-foreground border-border flex flex-col gap-3 rounded-xl border p-4 shadow-sm"
    >
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div class="flex min-w-0 flex-col gap-3 sm:flex-1">
          <header class="flex items-start gap-3">
            <div class="min-w-0 flex-1">
              <h3 class="min-w-0 text-base font-semibold">
                <button
                  type="button"
                  class="focus-visible:ring-ring/50 flex w-full min-w-0 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-3"
                  data-testid="line-card-toggle"
                  [attr.aria-expanded]="_expanded()"
                  (click)="toggleExpanded()"
                >
                  <span
                    class="border-border size-3 shrink-0 rounded-full border"
                    [style.background-color]="line().displayColor"
                    aria-hidden="true"
                  ></span>
                  <span class="min-w-0 flex-1 truncate">
                    <span class="text-muted-foreground">{{ line().code }}</span>
                    · {{ line().displayName }}
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    class="text-muted-foreground size-4 shrink-0 transition-transform duration-150 motion-reduce:transition-none"
                    [class.rotate-180]="_expanded()"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              </h3>
              <div class="mt-1.5 flex flex-wrap items-center gap-2">
                @if (line().status !== "ACTIVE") {
                  <app-status-info-chip [info]="lineStatusInfo(line().status)">
                    <line-status-badge [status]="line().status" />
                  </app-status-info-chip>
                }
                <app-status-info-chip
                  [info]="passengerInfo(line().passengerStatus)"
                  [scale]="passengerScale(line().passengerStatus, line().passengerStatusCounts)"
                  [windowMinutes]="_passengerWindowMinutes()"
                  linkFragment="sightings"
                >
                  <span
                    hlmBadge
                    data-testid="passenger-status"
                    [variant]="passengerVariant(line().passengerStatus)"
                  >
                    {{ passengerLabel(line().passengerStatus) }}
                  </span>
                </app-status-info-chip>
                <app-status-info-chip
                  [info]="_vehicleCountInfo()"
                  [breakdown]="_vehicleBreakdown()"
                >
                  <span
                    hlmBadge
                    variant="secondary"
                    data-testid="line-vehicle-count"
                    [attr.aria-label]="_vehicleCountLabel()"
                  >
                    {{ line().inServiceVehicleCount }}/{{ line().totalVehicleCount }} in service
                  </span>
                </app-status-info-chip>
              </div>
            </div>
          </header>

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

        <div class="flex flex-col items-start gap-2 sm:shrink-0 sm:flex-row">
          <button
            hlmBtn
            size="sm"
            data-testid="submit-line-status"
            class="w-full sm:w-auto"
            (click)="sheet.openFor(line().id)"
          >
            Submit line status
          </button>
          <button
            hlmBtn
            size="sm"
            variant="outline"
            data-testid="add-spotting-entry"
            class="w-full sm:w-auto"
            (click)="reportSheet.openFor(line().id)"
          >
            Add spotting entry
          </button>
        </div>
      </div>

      @if (_expanded()) {
        <div
          class="border-border flex flex-col gap-4 border-t pt-3"
          data-testid="line-card-expanded"
        >
          <app-line-status-chart
            [lineId]="line().id"
            [expanded]="_expanded()"
            [refreshTick]="refreshTick()"
          />
          <app-line-status-reports
            [lineId]="line().id"
            [expanded]="_expanded()"
            [refreshTick]="refreshTick()"
          />
        </div>
      }
    </section>
  `,
})
export class LinePulseCardComponent {
  readonly line = input.required<LinePulse>();
  /** The host's poll beat, forwarded to the expanded panel's chart and reports. */
  readonly refreshTick = input(0);

  protected readonly sheet = inject(LineStatusSheetService);
  protected readonly reportSheet = inject(ReportSheetService);

  protected readonly passengerLabel = passengerLabel;
  protected readonly passengerVariant = passengerVariant;
  protected readonly passengerInfo = passengerInfo;
  protected readonly passengerScale = passengerScale;
  protected readonly lineStatusInfo = lineStatusInfo;
  protected readonly _humanizeSince = humanizeSince;
  protected readonly _hostname = faviconHostnameOf;

  protected readonly _expanded = signal(false);

  protected readonly _links = computed(() => this.line().pulseLinks.slice(0, MAX_PULSE_LINKS));

  protected readonly _vehicleCountInfo = computed<StatusInfo>(() => {
    const doc = metricDoc("line-pulse.vehicle-count");
    return { title: doc.title, body: renderMethodologyCopy(doc.definition) };
  });

  protected readonly _vehicleCountLabel = computed(
    () =>
      `${this.line().inServiceVehicleCount} of ${this.line().totalVehicleCount} vehicles in service`,
  );

  protected readonly _vehicleBreakdown = computed<StatusBreakdownRow[]>(() => {
    const rows = vehicleStatusRows(this.line().vehicleStatusCounts);
    if (rows.length === 0) {
      return [];
    }
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    return [
      ...rows.map((row) => ({ key: row.key, label: row.label, value: `${row.count}` })),
      { key: "TOTAL", label: "Total", value: `${total}` },
    ];
  });

  protected readonly _passengerWindowMinutes = computed(() =>
    this.line().passengerStatus ? this.line().statusWindowMinutes : null,
  );

  protected toggleExpanded(): void {
    this._expanded.update((open) => !open);
  }
}
