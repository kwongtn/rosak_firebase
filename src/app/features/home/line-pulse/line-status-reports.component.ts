import { DatePipe } from "@angular/common";
import { Component, computed, effect, input } from "@angular/core";
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
} from "../data/home-history.queries";
import { passengerLabel, passengerVariant } from "../data/passenger-status.util";

/** The first page of the keyset connection — enough to read the room without a "load more". */
const REPORTS_PAGE_SIZE = 10;
const SKELETON_ROWS = 3;

/** One chip of the per-station strip: the station's display name and how many loaded reports named
 * it. `key` is the name too — the strip groups by display name, so the two are the same string and
 * `track` can use either. */
export interface StationStripEntry {
  key: string;
  label: string;
  count: number;
}

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
          <!-- Station strip: the SAME rows the list below already has, tallied by station. It adds
               no request and no fields — the stations selection was already there — and
               it answers the question the list cannot at a glance: WHERE. A line with nine reports
               and nine station names in the rows is a line-wide problem; the same nine piled on two
               stations is a platform problem, and those call for different reactions.

               v1 aggregates ONLY the pages this reader has loaded (the first page of ten). A
               report naming a station that did not make the page is not counted, so the strip is a
               "where, among the reports you can see", never a total. Making it complete would mean
               an additive backend aggregate over the status-report table (per-line station counts
               in the rolling window) — a documented option for a later phase, deliberately NOT taken
               here: this phase ships zero new network reads, and a client-side total over a truncated
               page would be a lie the reader cannot detect. The strip therefore HIDES itself rather
               than showing a partial count when there is no station data at all. -->
          @if (_stations().length > 0) {
            <div class="flex flex-wrap items-center gap-1.5" data-testid="station-strip">
              @for (station of _stations(); track station.key) {
                <span hlmBadge variant="neutral" class="gap-1">
                  <span class="truncate">{{ station.label }}</span>
                  <span class="tabular-nums" data-testid="station-strip-count">
                    {{ station.count }}
                  </span>
                </span>
              }
            </div>
          }

          <!-- Capped at ~5 one-line rows; rows carrying notes run taller, so this is approximate. -->
          <div class="max-h-56 overflow-y-auto pr-1" data-testid="line-status-reports-scroll">
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
                    <p class="text-muted-foreground" data-testid="report-notes">
                      {{ report.notes }}
                    </p>
                  }
                </li>
              }
            </ul>
          </div>
        }
      </section>
    }
  `,
})
export class LineStatusReportsComponent {
  readonly lineId = input.required<string>();
  /** The card's expansion state — the read stays inert (no request) until this is true. */
  readonly expanded = input.required<boolean>();
  /** Bumped by the parent's poll beat to refresh an already-open accordion. */
  readonly refreshTick = input(0);

  /** The last tick this component acted on. Seeded on the first effect pass so init never
   * re-issues the read the resource already made when `expanded` first turned true. */
  private _appliedRefreshTick: number | null = null;

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

  /**
   * The loaded reports tallied by station, busiest first with the name as the tiebreak so the strip
   * is stable between reads.
   *
   * Grouped by `displayName` rather than by `id` because that is what the reader sees in the rows
   * below and what the chip prints; two station rows sharing a display name are one place as far as
   * this surface is concerned. `?? []` on both the report's stations and the report list, because
   * `strictNullChecks` is OFF and a hand-built fixture must not throw inside a computed.
   *
   * Only the LOADED page is counted — see the template comment for why that is a documented v1 limit
   * rather than an omission, and why the strip hides itself instead of showing a partial total.
   */
  protected readonly _stations = computed<StationStripEntry[]>(() => {
    const counts = new Map<string, number>();
    for (const report of this.reports()) {
      for (const station of report.stations ?? []) {
        const key = station?.displayName ?? "";
        if (key === "") {
          continue;
        }
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([key, count]) => ({ key, label: key, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  });

  constructor() {
    effect(() => {
      const tick = this.refreshTick();
      if (this._appliedRefreshTick === null) {
        this._appliedRefreshTick = tick;
        return;
      }
      if (tick === this._appliedRefreshTick) {
        return;
      }
      this._appliedRefreshTick = tick;
      if (this.expanded()) {
        this.resource.reload();
      }
    });
  }
}
