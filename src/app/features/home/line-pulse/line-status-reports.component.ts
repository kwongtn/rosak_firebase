import { DatePipe } from "@angular/common";
import { Component, computed, input } from "@angular/core";
import { graphqlResource } from "../../../core/graphql/graphql-client";
import { HlmBadge } from "../../../ui/badge/badge";
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";
import { RetryBannerComponent } from "../../../ui/retry-banner/retry-banner.component";
import { humanizeSince } from "../../spotting/data/humanize-since.util";
import {
  LINE_STATUS_REPORTS_QUERY,
  LineStatusReportsQueryData,
  LineStatusReportsQueryVars,
  LineStatusReportItem,
} from "../data/home.queries";
import { passengerLabel, passengerVariant } from "../data/passenger-status.util";

/** The first page of the keyset connection — enough to read the room without a "load more". */
const REPORTS_PAGE_SIZE = 10;
const SKELETON_ROWS = 3;

/**
 * The expanded line card's recent community reports: each row is the passenger-status badge, an
 * optional delay and the related stations on the left, with the relative time pinned right (its
 * `title` carries the exact timestamp), plus the reporter's notes. Only the first page of
 * `lineStatusReports` is read, and — like the status sheet's station list — the read stays inert
 * until `expanded` is true, so a collapsed card never pays for it.
 */
@Component({
  selector: "app-line-status-reports",
  imports: [DatePipe, HlmBadge, HlmSkeleton, RetryBannerComponent],
  template: `
    @if (expanded()) {
      <section class="flex flex-col gap-2" data-testid="line-status-reports">
        <h4 class="text-muted-foreground text-xs font-medium">Recent community reports</h4>
        @if (resource.isLoading()) {
          <div class="flex flex-col gap-1.5">
            @for (_ of _skeletons; track $index) {
              <div hlmSkeleton class="h-12 w-full"></div>
            }
          </div>
        } @else if (resource.hasError()) {
          <app-retry-banner [resource]="resource" message="Couldn't load this line's reports." />
        } @else if (reports().length === 0) {
          <p class="text-muted-foreground text-sm" data-testid="line-status-reports-empty">
            No community reports for this line yet.
          </p>
        } @else {
          <ul class="flex flex-col gap-1.5">
            @for (report of reports(); track report.id) {
              <li
                class="border-border flex flex-col gap-1 rounded-lg border p-2.5 text-sm"
                data-testid="line-status-report"
              >
                <div class="flex items-start gap-2">
                  <div class="flex min-w-0 flex-wrap items-center gap-2">
                    <span hlmBadge [variant]="_passengerVariant(report.status)">
                      {{ _passengerLabel(report.status) }}
                    </span>
                    @if (report.delayMinutes; as delay) {
                      <span class="text-muted-foreground text-xs" data-testid="report-delay">
                        {{ delay }} min delay
                      </span>
                    }
                    @if (report.stations.length > 0) {
                      <span
                        class="text-muted-foreground min-w-0 truncate text-xs"
                        data-testid="report-station"
                        [title]="_stationNames(report.stations)"
                      >
                        {{ _stationNames(report.stations) }}
                      </span>
                    }
                  </div>
                  <span
                    class="text-muted-foreground ml-auto shrink-0 text-xs"
                    data-testid="report-time"
                    title="Reported {{ report.created | date: 'MMM d, y HH:mm' }}"
                  >
                    {{ _humanizeSince(report.created) }}
                  </span>
                </div>
                @if (report.notes) {
                  <p class="text-muted-foreground" data-testid="report-notes">{{ report.notes }}</p>
                }
              </li>
            }
          </ul>
        }
      </section>
    }
  `,
})
export class LineStatusReportsComponent {
  readonly lineId = input.required<string>();
  /** The card's expansion state — the read stays inert (no request) until this is true. */
  readonly expanded = input.required<boolean>();

  protected readonly _skeletons = Array.from({ length: SKELETON_ROWS });
  protected readonly _passengerLabel = passengerLabel;
  protected readonly _passengerVariant = passengerVariant;
  protected readonly _humanizeSince = humanizeSince;
  protected readonly _stationNames = (stations: LineStatusReportItem["stations"]): string =>
    stations.map((station) => station.displayName).join(", ");

  protected readonly resource = graphqlResource<
    LineStatusReportsQueryData,
    LineStatusReportsQueryVars
  >(() => {
    if (!this.expanded()) {
      return undefined;
    }
    return {
      query: LINE_STATUS_REPORTS_QUERY,
      variables: { lineId: this.lineId(), first: REPORTS_PAGE_SIZE },
    };
  });

  protected readonly reports = computed(
    () => this.resource.data()?.lineStatusReports?.edges?.map((edge) => edge.node) ?? [],
  );
}
