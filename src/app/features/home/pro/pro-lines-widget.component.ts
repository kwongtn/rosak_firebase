import { Component, PLATFORM_ID, computed, inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideDownload } from "@ng-icons/lucide";

import { LINE_STATUS_LABEL } from "../../../domain-ui/line-status-badge/line-status-badge";
import { CsvRow, downloadCsv, toCsv } from "../../../core/export/csv.util";
import {
  metricDoc,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import { HlmButton } from "../../../ui/button/button";
import { HlmCheckbox } from "../../../ui/checkbox/checkbox";
import { InfoPopover } from "../../../ui/info-popover/info-popover";
import { HlmNativeSelect } from "../../../ui/select/native-select";
import { NetworkBoardComponent } from "../line-pulse/network-board.component";
import { LineStatus, PassengerStatus } from "../data/home.queries";
import { HomeStore, LINE_STATUSES, PASSENGER_STATUSES } from "../data/home.store";
import { passengerLabel } from "../data/passenger-status.util";

/** The export's column set, written out once so the header row and the row builder cannot disagree. */
const EXPORT_COLUMNS: readonly string[] = [
  "lineCode",
  "lineName",
  "hourStart",
  "hourEnd",
  "count",
  "dominantStatus",
  "statusCounts",
];

/** A fixed filename, never a timestamped one — see {@link ProLinesWidgetComponent.exportCsv}. */
const EXPORT_FILENAME = "mlptf-line-service-day-history.csv";

/**
 * The Pro dashboard's LINES widget: the same `app-network-board`, three Pro-only filters above it, and
 * a CSV export of what those filters are currently showing.
 *
 * 🔴 **The board is REUSED, not reimplemented.** Every row, group, sort, anchor and highlight rule
 * under this widget is the component the Rider page mounts — one partition, one confidence chip, one
 * set of history strips. A Pro-specific copy of the board would be a SECOND answer to "which lines
 * need attention", and the two would drift the moment either gained a rule. The only thing this
 * widget owns is what surrounds the board.
 *
 * `embedHeatStrip` is turned off here because the dashboard gives the heat grid its own bento cell;
 * rendering it inside the board too would draw the grid twice and duplicate its testid.
 *
 * **The three filters are Pro-only and default off**, which is what leaves the Rider board untouched:
 * `HomeStore.visibleLines()` equals `lines()` until a Pro reader touches one of them, and the Rider
 * view mounts no control that could. They live in the STORE, not here, for two reasons — the board
 * reads them with no input at all (its documented "no inputs" rule, except for the one below), and
 * `ProDashboardComponent.ngOnDestroy` has to clear them from outside this component's lifetime.
 *
 * The passenger filter is a FLOOR ("delayed or worse"), not an equality: a Pro reader asking for
 * `DELAYED` wants everything at that severity and above, not the subset that happened to file exactly
 * `DELAYED`. "Only lines with data" is the store's own evidence rule — the same one the confidence
 * chip renders — and it is published in the methodology registry because it is a judgement the
 * reader is being asked to trust, not a literal they typed.
 *
 * **The export is "what I am looking at", not "everything".** It walks the same
 * `HomeStore.visibleLines()` the board is drawing, so a reader who narrowed the board gets a file of
 * that subset; a hidden line appearing in the CSV would be a file describing a network the reader is
 * not looking at. The service-day history comes from `linesHistoryFor()` — the ONE
 * `linesStatusHistory` request the board rows and the heat grid already share — so exporting costs no
 * new request. An empty result still produces a header-only CSV; see `core/export/csv.util.ts`.
 */
@Component({
  selector: "app-pro-lines-widget",
  imports: [HlmButton, HlmCheckbox, HlmNativeSelect, InfoPopover, NetworkBoardComponent, NgIcon],
  providers: [provideIcons({ lucideDownload })],
  template: `
    <section
      class="border-border bg-card flex flex-col gap-3 rounded-xl border p-4"
      data-testid="pro-lines-widget"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-sm font-semibold tracking-wide uppercase">Lines</h2>
        <button
          hlmBtn
          variant="outline"
          size="sm"
          class="gap-1.5"
          data-testid="pro-lines-export"
          (click)="exportCsv()"
        >
          <ng-icon name="lucideDownload" class="size-4" aria-hidden="true" />
          Export CSV
        </button>
      </div>

      <!-- Each filter's own default says itself ("Any status", "Any crowding") rather than offering a
           blank option a reader has to guess at. Native selects and a checkbox, not custom widgets:
           the OS picker is more accessible and more mobile-friendly for a closed enum, which is the
           same reasoning the native-select wrapper in src/app/ui/select records. -->
      <div class="flex flex-wrap items-end gap-4" data-testid="pro-lines-filters">
        <label class="flex min-w-0 flex-col gap-1 text-xs">
          <span class="text-muted-foreground">Status</span>
          <select
            hlmSelect
            class="w-40"
            data-testid="pro-filter-status"
            [value]="store.proStatusFilter() ?? ''"
            (change)="onStatusChanged($event)"
          >
            <option value="">Any status</option>
            @for (status of _statuses; track status) {
              <option [value]="status">{{ _statusLabel(status) }}</option>
            }
          </select>
        </label>

        <label class="flex min-w-0 flex-col gap-1 text-xs">
          <span class="text-muted-foreground">Crowding at least</span>
          <select
            hlmSelect
            class="w-40"
            data-testid="pro-filter-passenger"
            [value]="store.proPassengerFilter() ?? ''"
            (change)="onPassengerChanged($event)"
          >
            <option value="">Any crowding</option>
            @for (status of _passengerStatuses; track status) {
              <option [value]="status">{{ _passengerLabel(status) }}</option>
            }
          </select>
        </label>

        <div class="flex items-center gap-2 pb-1.5 text-xs">
          <hlm-checkbox
            data-testid="pro-filter-only-with-data"
            aria-label="Only lines with data"
            [checked]="store.proOnlyWithData()"
            (checkedChange)="onOnlyWithDataChanged($event)"
          />
          <label class="flex cursor-pointer items-center gap-1">
            <span>Only lines with data</span>
            <app-info-popover
              label="What 'with data' means"
              iconPosition="end"
              [content]="_hasDataDefinition()"
              testId="pro-filter-only-with-data-popover"
              [showMethodologyLink]="false"
              triggerClasses="text-muted-foreground cursor-help underline"
            >
              <span aria-hidden="true">?</span>
            </app-info-popover>
          </label>
        </div>

        @if (_anyFilterActive()) {
          <button
            hlmBtn
            variant="ghost"
            size="sm"
            class="pb-1.5"
            data-testid="pro-filter-clear"
            (click)="clearFilters()"
          >
            Clear filters
          </button>
        }
      </div>

      <!-- The Rider board, reused whole. The embedHeatStrip input is off because the dashboard gives that
           grid its own cell. -->
      <app-network-board [embedHeatStrip]="false" />
    </section>
  `,
})
export class ProLinesWidgetComponent {
  protected readonly store = inject(HomeStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly _statuses = LINE_STATUSES;
  protected readonly _passengerStatuses = PASSENGER_STATUSES;
  protected readonly _passengerLabel = passengerLabel;
  protected readonly _statusLabel = (status: LineStatus): string => LINE_STATUS_LABEL[status];

  /** True when at least one of the three filters is narrowing — gates the "Clear filters" escape. */
  protected readonly _anyFilterActive = computed(
    () =>
      this.store.proStatusFilter() !== null ||
      this.store.proPassengerFilter() !== null ||
      this.store.proOnlyWithData(),
  );

  /** The published definition of "has data" — never a literal in this template. */
  protected readonly _hasDataDefinition = computed(() =>
    renderMethodologyCopy(metricDoc("network.has-data").definition),
  );

  protected onStatusChanged(event: Event): void {
    const value = (event.target as HTMLSelectElement | null)?.value ?? "";
    this.store.setProStatusFilter(value === "" ? null : (value as LineStatus));
  }

  protected onPassengerChanged(event: Event): void {
    const value = (event.target as HTMLSelectElement | null)?.value ?? "";
    this.store.setProPassengerFilter(value === "" ? null : (value as PassengerStatus));
  }

  protected onOnlyWithDataChanged(checked: boolean): void {
    this.store.setProOnlyWithData(checked === true);
  }

  protected clearFilters(): void {
    this.store.setProStatusFilter(null);
    this.store.setProPassengerFilter(null);
    this.store.setProOnlyWithData(false);
  }

  /**
   * The exported rows: one per VISIBLE line, one per service-day hour that line reported in.
   *
   * 🔴 **`statusCounts` is formatted deterministically, in the order the backend already built it**
   * (the `PassengerStatus` declaration order, zeros omitted) — never re-sorted by magnitude and never
   * keyed off object iteration. A CSV that reordered its own columns between two exports of identical
   * data cannot be diffed, and a reader comparing the files would read a change that is not one.
   * An empty hour's breakdown is an empty cell rather than the words "none", so a spreadsheet sees a
   * blank and not a string.
   *
   * `hourStart`/`hourEnd` are the raw backend instants, verbatim: they are naive local wall time, so
   * running them through `Date` would shift them by the viewer's own offset. The columns exist for a
   * pivot in a spreadsheet, which is exactly the reader who wants the numbers as stored.
   */
  protected exportRows(): CsvRow[] {
    const rows: CsvRow[] = [];
    for (const line of this.store.visibleLines()) {
      for (const bucket of this.store.linesHistoryFor(line.id)) {
        rows.push({
          lineCode: line.code,
          lineName: line.displayName,
          hourStart: bucket.hourStart,
          hourEnd: bucket.hourEnd,
          count: bucket.count,
          dominantStatus: bucket.dominantStatus ?? "",
          statusCounts: bucket.statusCounts
            .map((entry) => `${entry.status}:${entry.count}`)
            .join(" "),
        });
      }
    }
    return rows;
  }

  /**
   * Hands the visible lines' service-day history to the browser as a CSV file.
   *
   * The filename is FIXED, not stamped with a date. The same reasoning that forbids a client clock in
   * query variables applies to a filename a reader may re-export: two exports of the same data in one
   * session would differ by a timestamp neither can reproduce, and the file manager already dates
   * files for them.
   *
   * Browser-gated inside `downloadCsv`, so calling this on the server is a no-op rather than an
   * attempt to build a `Blob` no document will ever click.
   */
  protected exportCsv(): void {
    downloadCsv(EXPORT_FILENAME, toCsv(EXPORT_COLUMNS, this.exportRows()), this.isBrowser);
  }
}
