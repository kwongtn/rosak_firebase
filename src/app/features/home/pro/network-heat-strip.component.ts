import { Component, computed, inject } from "@angular/core";

import {
  metricDoc,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import { InfoPopover } from "../../../ui/info-popover/info-popover";
import type { LineStatusHourBucket, PassengerStatus } from "../data/home.queries";
import { HomeStore } from "../data/home.store";
import { passengerBarClass } from "../data/passenger-status.util";
import {
  HEAT_INTENSITY_CLASSES,
  SERVICE_DAY_LABEL,
  heatCellClass,
  heatCellTitle,
  heatLegendEntries,
  historySummaryLabel,
  historyTotal,
  serviceHourLabel,
} from "../data/status-history-display.util";

/** One grid row: a line, its 24 cells, and the sentence a screen reader gets instead of them. */
interface HeatRow {
  lineId: string;
  code: string;
  buckets: LineStatusHourBucket[];
  cells: HeatCell[];
  /** The row's own service-day tally, shown in the code gutter. */
  total: number;
}

interface HeatCell {
  hourStart: string;
  hourLabel: string;
  title: string;
  colorClass: string;
}

/**
 * The **Pro heat grid**: every line as a row, every service-day hour as a column, one cell per
 * line-hour. It is the one place on the page where "which line, which hour" is answerable at a
 * glance — exactly the question a rider looking at a *network* fault has, and one no per-row chart
 * can answer.
 *
 * Hand-rolled `<div>`s on purpose: this repo has no charting dependency, and adding one for a grid of
 * coloured cells would be the largest dependency this feature has ever taken. The colour vocabulary
 * is the same `PASSENGER_BAR_CLASS` the expanded card's chart uses, reached through
 * `status-history-display.util`, so an hour the reader saw as amber in a row's panel is amber here.
 *
 * 🔴 **Two dimensions, and the split is the design.** Colour carries WHICH status dominated the
 * hour; opacity carries HOW MANY reports it had, relative to the busiest cell on screen. "Disrupted"
 * and "six people said it" are different facts and a single colour cannot carry both. The ladder is
 * a list of literal Tailwind utilities (`HEAT_INTENSITY_CLASSES`), never interpolated classes,
 * because Tailwind v4 compiles what it finds as literal text in the source.
 *
 * 🔴 **Hidden on a failed read, and it never owns an error.** It reads the store's own
 * `linesHistoryFailed`, not the page's `hasError()`: a Pro grid is a supporting widget, and a grid
 * that will not load must not put the retry banner over the board a Pro reader came for. Same
 * asymmetry the hero sparkline and the row strips take, from the two signals the store deliberately
 * keeps out of `hasError` / `isLoading` / `isRefreshing`.
 *
 * Accessibility: the grid is a `role="group"` and **each row is its own `role="img"`** carrying one
 * sentence — the same `historySummaryLabel` shape the sparkline and the row strips use, scoped to
 * that line. Per row rather than one sentence for the whole grid, because the comparison BETWEEN
 * lines is the entire point of this widget and a single summary would hide exactly that. The cells
 * are `aria-hidden`; their hour-level detail lives in `title` for the pointer path.
 *
 * One `linesStatusHistory` request in the store serves every row here (the backend answers up to 64
 * lines per call), so this component adds **no reads of its own**.
 *
 * It reads `visibleLines()` rather than `lines()`, so the grid is always the SAME SET of lines the
 * board beside it is drawing. The shared intensity scale is computed over those same rows, so a
 * filter narrows the grid and its scale together; a grid scaled to unfiltered lines while showing
 * filtered ones would let a filtered-OUT busy hour still set the darkest step, which reads as
 * "heavy hour" about a line that is no longer drawn.
 */
@Component({
  selector: "app-network-heat-strip",
  imports: [InfoPopover],
  template: `
    @if (_visible()) {
      <section class="flex flex-col gap-2" data-testid="network-heat-strip">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Reports by line and hour
          </h3>
          <div class="flex items-center gap-2">
            <span class="text-muted-foreground text-xs tabular-nums" data-testid="heat-scale">
              {{ _maxCount() }} peak
            </span>
            <app-info-popover
              label="How the heat grid reads"
              [content]="_definition()"
              testId="network-heat-strip-popover"
              [showMethodologyLink]="false"
              triggerClasses="cursor-help"
            >
              <span class="text-muted-foreground text-xs hover:underline">Legend</span>
            </app-info-popover>
          </div>
        </div>

        <!-- The hour axis, naming the window rather than all 24 hours: at this cell width 24 labels
             would be illegible, and each cell's title already carries the hour it stands for. -->
        <div class="flex items-end gap-2" aria-hidden="true">
          <span class="w-12 shrink-0"></span>
          <span class="text-muted-foreground min-w-0 flex-1 text-[10px]">
            Service day {{ _serviceDayLabel }}
          </span>
        </div>

        <div class="flex flex-col gap-px" role="group" [attr.aria-label]="_groupLabel()">
          @for (row of _rows(); track row.lineId) {
            <div
              class="flex items-center gap-2"
              role="img"
              [attr.aria-label]="_rowLabel(row)"
              data-testid="heat-row"
              [attr.data-line-id]="row.lineId"
            >
              <span
                class="text-muted-foreground w-12 shrink-0 truncate text-[11px] font-medium tabular-nums"
                data-testid="heat-row-code"
              >
                {{ row.code }}
              </span>
              <div class="flex h-5 min-w-0 flex-1 gap-px">
                @for (cell of row.cells; track cell.hourStart) {
                  <div
                    class="min-w-0 flex-1 rounded-[1px]"
                    [class]="cell.colorClass"
                    [title]="cell.title"
                    aria-hidden="true"
                    data-testid="heat-cell"
                    [attr.data-hour]="cell.hourLabel"
                  ></div>
                }
              </div>
              <span
                class="text-muted-foreground w-7 shrink-0 text-right text-[10px] tabular-nums"
                data-testid="heat-row-total"
              >
                {{ row.total }}
              </span>
            </div>
          }
        </div>

        <!-- The colour key: one swatch per passenger status in the backend's severity order, plus the
             intensity ramp. A reader can therefore NAME a cell instead of guessing at it. -->
        <div
          class="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]"
          data-testid="heat-legend"
        >
          @for (entry of _legend; track entry.status) {
            <span class="flex items-center gap-1">
              <span class="size-2 rounded-full" [class]="_swatch(entry.status)"></span>
              {{ entry.label }}
            </span>
          }
          <span class="flex items-center gap-1">
            <span>{{ _intensityLabel() }}</span>
            @for (step of _intensitySteps; track step) {
              <span class="size-2 rounded-full bg-muted" [class]="step"></span>
            }
          </span>
        </div>
      </section>
    }
  `,
})
export class NetworkHeatStripComponent {
  private readonly store = inject(HomeStore);

  protected readonly _serviceDayLabel = SERVICE_DAY_LABEL;
  protected readonly _legend = heatLegendEntries();
  /** Full class strings for the ramp's swatches — the literal utilities plus their shape classes. */
  protected readonly _intensitySteps = HEAT_INTENSITY_CLASSES.map(
    (utility) => `size-2 rounded-full bg-muted ${utility}`,
  );

  /**
   * The busiest cell ANY line reported this service day — the grid's ONE shared scale.
   *
   * Deliberately the opposite of the row strips, which scale to their own line. The comparison
   * between lines is the whole point of this grid: a per-row scale would render a line with two
   * reports exactly as dark as a line with two hundred, and the reading the widget exists for would
   * be impossible.
   */
  protected readonly _maxCount = computed(() => {
    let max = 0;
    for (const line of this.store.visibleLines()) {
      for (const bucket of this.store.linesHistoryFor(line.id)) {
        max = Math.max(max, bucket.count);
      }
    }
    return max;
  });

  protected readonly _rows = computed<HeatRow[]>(() => {
    const max = this._maxCount();
    return this.store.visibleLines().map((line) => {
      const buckets: LineStatusHourBucket[] = this.store.linesHistoryFor(line.id);
      return {
        lineId: line.id,
        code: line.code,
        buckets,
        total: historyTotal(buckets),
        cells: buckets.map((bucket) => ({
          hourStart: bucket.hourStart,
          hourLabel: serviceHourLabel(bucket.hourStart),
          title: heatCellTitle(line.code, bucket),
          colorClass: heatCellClass(bucket.count, max, bucket.dominantStatus),
        })),
      };
    });
  });

  /** Any data at all: at least one line with at least one bucket. */
  private readonly _hasCells = computed(() => this._rows().some((row) => row.cells.length > 0));

  /**
   * The whole widget, or nothing. The failure is the resource's OWN flag — never
   * `HomeStore.hasError()`; see the class doc for why.
   */
  protected readonly _visible = computed(
    () => !this.store.linesHistoryFailed() && this._hasCells(),
  );

  /** What the grid is, for the group's accessible name. */
  protected readonly _groupLabel = computed(
    () => `Reports by line and hour across the network, service day ${SERVICE_DAY_LABEL}`,
  );

  /** One row's sentence — same shape as the sparkline's and the row strip's, scoped to that line. */
  protected _rowLabel(row: HeatRow): string {
    return historySummaryLabel(row.buckets, `Line ${row.code}`);
  }

  /** The definition, from the methodology registry — never a literal in this template. */
  protected readonly _definition = computed(() =>
    renderMethodologyCopy(metricDoc("network.heat-strip").definition),
  );

  /** "0 to 24 reports" — the human scale the intensity ramp draws. */
  protected readonly _intensityLabel = computed(() => `0 to ${this._maxCount()} reports`);

  /** A legend swatch: the status's colour at full strength, with no intensity attached. */
  protected _swatch(status: PassengerStatus): string {
    return passengerBarClass(status);
  }

  constructor() {
    // The same single per-line read the row strips ask for — this grid is a second VIEW of it, not a
    // read of its own, which is why mounting both costs nothing extra.
    this.store.requestHistoryReads();
  }
}
