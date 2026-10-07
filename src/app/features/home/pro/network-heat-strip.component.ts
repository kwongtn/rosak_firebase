import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from "@angular/core";

import { injectIsBrowser } from "../../../core/composables/is-browser";
import { metricTooltip } from "../../../core/methodology/methodology-render.util";
import { InfoPopover } from "../../../ui/info-popover/info-popover";
import type { PassengerStatus } from "../data/home.queries";
import type { LineStatusHourBucket } from "../data/home-history.queries";
import { HomeStore } from "../data/home.store";
import { PASSENGER_LABEL, passengerBarClass } from "../data/passenger-status.util";
import {
  HEAT_INTENSITY_CLASSES,
  SERVICE_DAY_LABEL,
  currentServiceBucketIndex,
  heatCellClass,
  heatLegendEntries,
  historySummaryLabel,
  historyTotal,
  reportsPhrase,
  serviceHourLabel,
  serviceHourRangeLabel,
} from "../data/status-history-display.util";

/** One grid row: a line, its 24 cells, and the sentence a screen reader gets instead of them. */
interface HeatRow {
  lineId: string;
  code: string;
  /** The line's full name — the gutter is wide enough to show the code whole, and this is what its
   * `title` carries, since a three-letter code identifies nothing to a rider who does not commute. */
  displayName: string;
  buckets: LineStatusHourBucket[];
  cells: HeatCell[];
  /** The row's own service-day tally, shown in the code gutter. */
  total: number;
}

/**
 * One grid cell: a COLUMN (an hour of the service day) filled from this line's own bucket for it.
 *
 * Built from the column template rather than from the line's buckets, which is why an hour this line
 * reported nothing about still exists as a `HeatCell` (`isEmpty`) — see `_columns`.
 */
interface HeatCell {
  hourStart: string;
  hourEnd: string;
  hourLabel: string;
  colorClass: string;
  count: number;
  statusCounts: Array<{ status: PassengerStatus; count: number }>;
  /** No bucket at all for this hour on this line — the grey no-data box, NOT a quiet hour. */
  isEmpty: boolean;
  /** The hour the reader is in right now, drawn as a glow rather than as a recoloured cell. */
  isCurrentHour: boolean;
}

/** The one open popover: which line-hour, and where its cell measured. */
interface HoveredCell {
  row: HeatRow;
  cell: HeatCell;
  /** The cell's horizontal centre, in pixels RELATIVE TO THE GRID WRAPPER. */
  anchorX: number;
  /** The cell's top and bottom edges, wrapper-relative. */
  anchorTop: number;
  anchorBottom: number;
  /** Whether the panel pops above the cell (false for the first rows, which have the axis above). */
  above: boolean;
}

/** Gap between the popover and its cell, in px — the heatmap tooltip's `mb-1.5` / `mt-1.5`. */
const POPOVER_GAP_PX = 6;

/**
 * How many rows from the top pop BELOW their cell instead of above it.
 *
 * Measured off the row's own index rather than off available space because there is none to measure:
 * the grid is `position: relative` with no clipping and its first row sits ~20px under the hour axis,
 * so "pop above" would bury the panel under the axis on exactly the rows a reader scans first. Two
 * rows is where the topmost cell finally has its own height to put a panel into.
 */
const ROWS_POPPING_BELOW = 2;

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
 * 🔴 **EVERY row is the SAME 24 columns, whatever that line reported.** The columns come from one
 * template (`_columns`) — the first visible line with any bucket at all — and each row looks its own
 * hour up by `hourStart`. A line the backend returned `buckets: []` for (nothing reported on it all
 * service day) therefore draws 24 GREY no-data boxes rather than the blank strip it used to: a
 * missing row reads as "this widget failed to render that line", and worse, it silently destroys
 * the column alignment the whole comparison rests on. A missing hour is still a cell.
 *
 * 🔴 **The hour the reader is in glows; it is not recoloured.** A wash on the cell itself (the
 * spotting details grid's "today" wash) would either fight the status colour that carries the data or
 * animate that cell's opacity, and "the busiest hour is where we are" has to be readable ON a cell of
 * any colour. So the marker is a separate absolutely-positioned ring + shadow, `pointer-events-none`,
 * drawn over the cell and never under it. And the clock behind it is seeded in `afterNextRender`
 * (see the ctor) so the server never renders a marker the client's first paint cannot reproduce.
 *
 * 🔴 **Hidden on a failed read, and it never owns an error.** It reads the store's own
 * `linesHistoryFailed`, not the page's `hasError()`: a Pro grid is a supporting widget, and a grid
 * that will not load must not put the retry banner over the board a Pro reader came for. Same
 * asymmetry the hero sparkline and the board rows take, from the two signals the store deliberately
 * keeps out of `hasError` / `isLoading` / `isRefreshing`.
 *
 * 🔴 **Empty is NOT hidden.** A failed read hides the widget; a read that SUCCEEDED and found nothing
 * renders one labelled sentence (`heat-empty`). The two are different facts and the grid keeps them
 * different — "we could not load it" is a widget problem to stay quiet about, while "no rider reported
 * anything in this service day" is the answer to the question this cell exists to answer, and on a
 * quiet morning it is the correct, whole answer. An empty bordered card reads as a rendering fault.
 *
 * Accessibility: the grid is a `role="group"` and **each row is its own `role="img"`** carrying one
 * sentence — the same `historySummaryLabel` shape the sparkline uses, scoped to that line. Per row
 * rather than one sentence for the whole grid, because the comparison BETWEEN
 * lines is the entire point of this widget and a single summary would hide exactly that. The cells
 * stay `aria-hidden` and their hour-level detail moved from a native `title` into ONE JS-driven
 * popover panel (the `/profile` heatmap's shape) — a native title cannot carry a per-status
 * breakdown, and 24 browser-default tooltips per row that each block on hover are unusable anyway.
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
              iconPosition="end"
              [content]="_definition()"
              testId="network-heat-strip-popover"
              [showMethodologyLink]="false"
              triggerClasses="cursor-help"
            >
              <span class="text-muted-foreground text-xs hover:underline">Legend</span>
            </app-info-popover>
          </div>
        </div>

        <!-- The window this grid covers, above a tick row that names every OTHER hour. Alternating
             labels (03, 05, 07 …) rather than all 24: at this cell width a label per column collides
             with its neighbour, and a collided axis is worse than a sparse one. The w-20 / w-7
             gutters are the ROW's own, so the axis lines up with the cells it describes rather than
             with the card. -->
        <div class="flex items-end gap-2" aria-hidden="true">
          <span class="w-20 shrink-0"></span>
          <span class="text-muted-foreground min-w-0 flex-1 text-[10px]">
            Service day {{ _serviceDayLabel }}
          </span>
          <span class="w-7 shrink-0"></span>
        </div>
        <div class="flex items-center gap-2" aria-hidden="true" data-testid="heat-axis">
          <span class="w-20 shrink-0"></span>
          <div class="flex min-w-0 flex-1 gap-px">
            @for (tick of _axis(); track tick.hourStart) {
              <span
                class="text-muted-foreground min-w-0 flex-1 text-center text-[10px] tabular-nums"
              >
                {{ tick.hourLabel }}
              </span>
            }
          </div>
          <span class="w-7 shrink-0"></span>
        </div>

        <!-- The positioning context for the ONE hover panel. "relative" on this wrapper (not on the
             cell) is what lets a single panel sit above any cell without becoming that cell's
             descendant — a panel inside a cell would be clipped, restacked and re-measured per cell. -->
        <div class="relative" (mouseleave)="onGridLeave()" data-testid="heat-grid" #grid>
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
                  class="text-muted-foreground w-20 shrink-0 text-[11px] font-medium tabular-nums"
                  data-testid="heat-row-code"
                  [title]="row.displayName"
                >
                  {{ row.code }}
                </span>
                <div class="flex h-5 min-w-0 flex-1 gap-px">
                  @for (cell of row.cells; track cell.hourStart) {
                    <div
                      class="relative min-w-0 flex-1 rounded-[1px]"
                      [class]="cell.colorClass"
                      [attr.data-hour]="cell.hourLabel"
                      [attr.data-empty]="cell.isEmpty ? '' : null"
                      [attr.data-current-hour]="cell.isCurrentHour ? '' : null"
                      (mouseenter)="onCellEnter(row, cell, $event)"
                      aria-hidden="true"
                      data-testid="heat-cell"
                    >
                      @if (cell.isCurrentHour) {
                        <!-- The ring is a SIBLING overlay, never a class on the cell: "animate-pulse"
                             on the cell would fade the status colour that carries its data along with
                             the marker, and a wash behind it would hide the colour entirely. An
                             absolutely-positioned, pointer-events-none span over the cell keeps both
                             readings. "motion-safe:" leaves a static glow for a reader who asked for
                             less motion — the hour still has to be findable. -->
                        <span
                          class="pointer-events-none absolute -inset-px rounded-[2px] ring-2 ring-amber-400/80 shadow-[0_0_8px_2px_rgba(251,191,36,0.5)] motion-safe:animate-pulse"
                          aria-hidden="true"
                          data-testid="heat-cell-glow"
                        ></span>
                      }
                    </div>
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

          @if (_hovered(); as hovered) {
            <!-- 🔴 ONE panel for the whole grid, and it is "pointer-events-none": a panel that could
                 take the pointer would either trap it (moving towards the panel closes it) or, worse,
                 steal the hover from the cell beneath it. Hidden until the measuring effect below has
                 placed it, so the reader never sees a frame of it at 0,0. -->
            <div
              class="bg-popover text-popover-foreground border-border pointer-events-none absolute z-20 w-max rounded-lg border p-2 text-xs shadow-md"
              [style.left.px]="_panelLeft()"
              [style.top.px]="_panelTop()"
              [style.visibility]="_panelPos() ? null : 'hidden'"
              aria-hidden="true"
              data-testid="heat-popover"
              #panel
            >
              <p class="font-medium whitespace-nowrap">
                {{ hovered.row.displayName }} ({{ hovered.row.code }})
              </p>
              <p class="whitespace-nowrap">
                {{ serviceHourRangeLabel(hovered.cell.hourStart, hovered.cell.hourEnd) }}
              </p>
              <p class="font-medium whitespace-nowrap">{{ reportsPhrase(hovered.cell.count) }}</p>
              @if (hovered.cell.statusCounts.length > 0) {
                <div class="mt-1 flex flex-col gap-0.5">
                  @for (entry of hovered.cell.statusCounts; track entry.status) {
                    <div class="flex items-center gap-1.5 whitespace-nowrap">
                      <span class="size-2 rounded-full" [class]="_swatch(entry.status)"></span>
                      <span>{{ _passengerLabel[entry.status] }}</span>
                      <span class="text-muted-foreground ml-auto tabular-nums">
                        {{ entry.count }}
                      </span>
                    </div>
                  }
                </div>
              } @else {
                <p class="text-muted-foreground">No reports</p>
              }
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
    } @else if (!_failed()) {
      <!-- 🔴 A SENTENCE, NOT A BLANK BORDERED CARD. This widget's cell is a core Pro surface — "which line,
           which hour" is the question the whole page exists to answer — so a quiet network has to SAY it is
           quiet. Rendering nothing here left the cell an empty box, which reads as a layout fault rather than
           as a fact about the day. This is the honest rendering of linesStatusHistory returning no buckets for
           the service day, which on a fresh install is the normal state, not an error.

           It is deliberately NOT the same sentence as the row sparkline's, which hides itself: the sparkline
           sits under a hero that already states the network's condition, while this cell is its own panel and a
           silent one would be indistinguishable from a broken one. The failure branch still hides everything —
           "we could not load it" and "there was nothing" must not look the same. -->
      <p class="text-muted-foreground text-sm" data-testid="heat-empty">
        No rider reports in this service day yet.
      </p>
    }
  `,
})
export class NetworkHeatStripComponent {
  private readonly store = inject(HomeStore);
  private readonly isBrowser = injectIsBrowser();

  protected readonly _serviceDayLabel = SERVICE_DAY_LABEL;
  protected readonly _legend = heatLegendEntries();
  protected readonly _passengerLabel = PASSENGER_LABEL;
  protected readonly serviceHourRangeLabel = serviceHourRangeLabel;
  protected readonly reportsPhrase = reportsPhrase;
  /** Full class strings for the ramp's swatches — the literal utilities plus their shape classes. */
  protected readonly _intensitySteps = HEAT_INTENSITY_CLASSES.map(
    (utility) => `size-2 rounded-full bg-muted ${utility}`,
  );

  /** The rows wrapper — the popover's positioning context and the box it is clamped inside. */
  private readonly _grid = viewChild.required<ElementRef<HTMLElement>>("grid");
  /** The one open panel, read back purely so its own size can be measured (see the ctor effect). */
  private readonly _panel = viewChild<ElementRef<HTMLElement>>("panel");

  /**
   * The busiest cell ANY line reported this service day — the grid's ONE shared scale.
   *
   * Deliberately NOT a per-row scale, unlike every other history surface, which scales to its own
   * series. The comparison between lines is the whole point of this grid: a per-row scale would
   * render a line with two reports exactly as dark as a line with two hundred, and the reading the
   * widget exists for would be impossible.
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

  /**
   * 🔴 THE COLUMN TEMPLATE: the first visible line that reported anything at all this service day.
   *
   * The backend zero-fills 24 buckets per line, so in the happy path EVERY line already has 24 and
   * this is just the first row's series. Its job is the unhappy path: a line can come back with
   * `buckets: []` ("nothing was reported about this line today") while others have a full day, and
   * mapping cells off that line's own empty array gave it a blank strip — no cells, and every hour
   * misaligned against the axis and against the row below. Anchoring the columns to a line that HAS
   * a day and looking every other line's hours up in it makes a missing hour a grey cell instead of
   * a missing column. `[]` when no line has anything, which keeps the empty state exactly as it was.
   */
  protected readonly _columns = computed<LineStatusHourBucket[]>(() => {
    for (const line of this.store.visibleLines()) {
      const buckets = this.store.linesHistoryFor(line.id);
      if (buckets.length > 0) {
        return buckets;
      }
    }
    return [];
  });

  /** The axis ticks: the template's hours, labelled on ALTERNATE columns only (see the template). */
  protected readonly _axis = computed(() =>
    this._columns().map((column, index) => ({
      hourStart: column.hourStart,
      hourLabel: index % 2 === 0 ? serviceHourLabel(column.hourStart) : "",
    })),
  );

  /**
   * 🔴 "Now", seeded in the browser only. `afterNextRender` does not run on the server, so SSR markup
   * never depends on the server's clock and the client's first paint is the same marker-free grid the
   * server sent. `null` therefore means both "not seeded yet" and "no current hour", and both draw no
   * glow rather than guess.
   */
  private readonly _now = signal<Date | null>(null);
  /** True once the browser seed has run — the effect's "not the first pass" gate (see the ctor). */
  private _clockSeeded = false;

  /** The `hourStart` of the hour being read now, or `null` when there is no clock or no match. */
  private readonly _currentHourStart = computed<string | null>(() => {
    const now = this._now();
    if (!now) {
      return null;
    }
    const index = currentServiceBucketIndex(this._columns(), now);
    return index < 0 ? null : this._columns()[index].hourStart;
  });

  protected readonly _rows = computed<HeatRow[]>(() => {
    const max = this._maxCount();
    const columns = this._columns();
    const currentHour = this._currentHourStart();
    return this.store.visibleLines().map((line) => {
      const buckets: LineStatusHourBucket[] = this.store.linesHistoryFor(line.id);
      // One lookup per row instead of a nested scan per cell: the cells are the template's hours, so
      // this map is what turns "which hour is this cell" from 24 string comparisons into one.
      const byHour = new Map(buckets.map((bucket) => [bucket.hourStart, bucket]));
      return {
        lineId: line.id,
        code: line.code,
        displayName: line.displayName,
        buckets,
        total: historyTotal(buckets),
        cells: columns.map((column) => {
          const bucket = byHour.get(column.hourStart);
          return {
            hourStart: column.hourStart,
            hourEnd: column.hourEnd,
            hourLabel: serviceHourLabel(column.hourStart),
            // 🔴 An hour this line has NO bucket for is a no-data cell, not an empty one: both paint
            // `bg-muted` today, but they are different facts and only the no-data one gets
            // `data-empty` — an hour with a bucket and a zero count is a hour riders reported nothing
            // in, which the popover can say as "No reports".
            colorClass: bucket
              ? heatCellClass(bucket.count, max, bucket.dominantStatus)
              : heatCellClass(0, max, null),
            count: bucket?.count ?? 0,
            statusCounts: bucket?.statusCounts ?? [],
            isEmpty: !bucket,
            isCurrentHour: currentHour !== null && currentHour === column.hourStart,
          };
        }),
      };
    });
  });

  /** Any data at all: at least one line with at least one bucket — i.e. a column template exists. */
  private readonly _hasCells = computed(() => this._columns().length > 0);

  /**
   * The whole widget, or nothing. The failure is the resource's OWN flag — never
   * `HomeStore.hasError()`; see the class doc for why.
   */
  protected readonly _visible = computed(
    () => !this.store.linesHistoryFailed() && this._hasCells(),
  );

  /** The per-line read's own failure flag, split out so the empty state can be told from a failed one. */
  protected readonly _failed = computed(() => this.store.linesHistoryFailed());

  /** What the grid is, for the group's accessible name. */
  protected readonly _groupLabel = computed(
    () => `Reports by line and hour across the network, service day ${SERVICE_DAY_LABEL}`,
  );

  /**
   * One row's sentence — the same `historySummaryLabel` shape the sparkline uses, scoped to that line.
   */
  protected _rowLabel(row: HeatRow): string {
    return historySummaryLabel(row.buckets, `Line ${row.code}`);
  }

  /** The tooltip copy, from the methodology registry — never a literal in this template. */
  protected readonly _definition = computed(() => metricTooltip("network.heat-strip"));

  /** "0 to 24 reports" — the human scale the intensity ramp draws. */
  protected readonly _intensityLabel = computed(() => `0 to ${this._maxCount()} reports`);

  /** A legend swatch (and a popover status dot): the status's colour at full strength. */
  protected _swatch(status: PassengerStatus): string {
    return passengerBarClass(status);
  }

  /** The ONE open cell, or `null`. At most one panel exists at any moment, by design. */
  protected readonly _hovered = signal<HoveredCell | null>(null);

  /**
   * The panel's measured position in wrapper-relative pixels, or `null` while it is still being
   * measured — which is also what keeps it `visibility: hidden` for that one pass.
   */
  protected readonly _panelPos = signal<{ left: number; top: number } | null>(null);
  protected readonly _panelLeft = computed(() => this._panelPos()?.left ?? 0);
  protected readonly _panelTop = computed(() => this._panelPos()?.top ?? 0);

  /**
   * Open the panel on a cell, measuring the cell against the grid wrapper.
   *
   * The measurement is the load-bearing part: the panel is `w-max`, so its width is a function of the
   * line's name and its longest breakdown entry — neither of which is knowable before it renders, and
   * neither of which may be guessed from the cell's position with percentages. Anchoring it on the
   * cell's own centre and clamping it to the wrapper's width is what keeps a panel on a first-hour
   * cell from hanging off the left edge of the card. It is measured ONCE per hover rather than tracked
   * against scroll, for the same reason the spotting grid does it: the grid does not scroll
   * independently, and a pointer that scrolls the page has already moved off the cell.
   */
  protected onCellEnter(row: HeatRow, cell: HeatCell, event: Event): void {
    const wrapper = this._grid().nativeElement.getBoundingClientRect();
    const cellRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this._panelPos.set(null);
    this._hovered.set({
      row,
      cell,
      anchorX: cellRect.left - wrapper.left + cellRect.width / 2,
      anchorTop: cellRect.top - wrapper.top,
      anchorBottom: cellRect.bottom - wrapper.top,
      above:
        this._rows().findIndex((candidate) => candidate.lineId === row.lineId) >=
        ROWS_POPPING_BELOW,
    });
  }

  /** The pointer left the grid — and, being `pointer-events-none`, it cannot have left via the panel. */
  protected onGridLeave(): void {
    this._hovered.set(null);
  }

  constructor() {
    // The same single per-line read the board rows ask for — this grid is a second VIEW of it, not a
    // read of its own, which is why mounting both costs nothing extra.
    this.store.requestHistoryReads();

    if (this.isBrowser) {
      afterNextRender(() => {
        this._clockSeeded = true;
        this._now.set(new Date());
      });
    }

    // The poll beat is the only thing that moves the clock while the grid sits open, and the current
    // hour has to follow it — a Pro tab left up across an hour boundary would otherwise keep glowing
    // the hour that has passed. `_clockSeeded` is what keeps this OFF its first run: an effect runs
    // during change detection, i.e. BEFORE `afterNextRender`, and setting the clock there would put a
    // client-clock marker in the very paint the server never produced (NG0500).
    effect(() => {
      this.store.linesRefreshTick();
      if (this._clockSeeded) {
        this._now.set(new Date());
      }
    });

    // The panel's own size can only be read once it is in the DOM, so the placement runs here rather
    // than in `onCellEnter`: the hover writes the anchor, the view renders the panel hidden at 0,0,
    // and this pass measures it and writes the final coordinates. Reading `_panel()` (a viewChild
    // signal) is what re-triggers the effect when it appears, and resetting `_panelPos` on each new
    // hover is what stops the previous cell's position from flashing on the new one.
    effect(() => {
      const hovered = this._hovered();
      const panel = this._panel();
      if (!hovered || !panel) {
        return;
      }
      const wrapper = this._grid().nativeElement.getBoundingClientRect();
      const width = panel.nativeElement.offsetWidth;
      const height = panel.nativeElement.offsetHeight;
      const left = Math.min(
        Math.max(hovered.anchorX - width / 2, 0),
        Math.max(wrapper.width - width, 0),
      );
      const top = hovered.above
        ? Math.max(hovered.anchorTop - height - POPOVER_GAP_PX, 0)
        : hovered.anchorBottom + POPOVER_GAP_PX;
      this._panelPos.set({ left, top });
    });
  }
}
