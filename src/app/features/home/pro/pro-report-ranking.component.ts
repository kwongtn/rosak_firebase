import { Component, computed, inject } from "@angular/core";

import {
  metricDoc,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import { InfoPopover } from "../../../ui/info-popover/info-popover";
import { HomeStore } from "../data/home.store";
import {
  MIN_HISTORY_BAR_PERCENT,
  SERVICE_DAY_LABEL,
  historyTotal,
  reportsPhrase,
} from "../data/status-history-display.util";

/**
 * How many lines the worst-lines ranking shows.
 *
 * Five because the widget's job is "which lines are this service day's worst", and that question is
 * answered by a short head — the sixth-worst line is not something a reader acts on from a Pro panel,
 * and the full ranking is the heat grid directly above it, one column further across. Published as
 * `REPORT_RANKING_TOP_LINES` in the methodology constants so the panel's own copy and this number
 * cannot drift.
 */
export const REPORT_RANKING_TOP_LINES = 5;

/** One ranked line: its code, its service-day report total, and that total as a share of the leader. */
interface RankingRow {
  lineId: string;
  code: string;
  count: number;
  /** Width of the bar as a percentage, already floored so a single report is still a visible bar. */
  percent: number;
}

/**
 * The Pro dashboard's WORST LINES widget: the lines that received the most rider reports this service
 * day, busiest first.
 *
 * 🔴 **It is a RANKING OVER THE DATA ALREADY ON THE PAGE — no read of its own.** Every count is
 * `historyTotal(linesHistoryFor(line.id))` over the same `linesStatusHistory` buckets the board's row
 * strips and the heat grid read, so mounting this widget costs ZERO requests; it calls
 * `requestHistoryReads()` in its constructor for the same reason the heat grid does — so the read
 * happens if this widget is the only history surface mounted, not because it needs anything private.
 * That also means it inherits the heat grid's failure rule for free: `linesHistoryFailed` hides the
 * widgets that draw that read and nothing else, so this one is never in the page's `hasError`.
 *
 * 🔴 **REPORTS, NOT FAULTS — and the widget says so.** A count is one rider report. A line can be
 * top of this list for a dozen ordinary complaints about crowding and still be running, and a line can
 * be broken and quiet. So the bar is a single brand-coloured fill with the LENGTH carrying the whole
 * reading, deliberately NOT the heat grid's two dimensions (colour = dominant status, strength =
 * count): this is a total, and a total has no status to colour it with. The methodology popover is
 * where the reader is told what is being counted.
 *
 * It reads `visibleLines()`, not `lines()`, for the reason the heat grid does — the Pro filters narrow
 * the board, and a ranking over lines the board is not drawing would rank lines the reader cannot see
 * on the same page. Only lines with at least one report are ranked, so a network nobody reported
 * anything about hides the widget rather than listing five zeroes: an all-zero list is the same "no
 * reports in this service day" sentence the sparkline gives, and drawing it as five bars would dress
 * that absence up as a measurement.
 *
 * Ties break on the line code, the same total order the board's own "by name" sort uses, so two
 * lines with the same total cannot swap places between renders or between readers.
 */
@Component({
  selector: "app-pro-report-ranking",
  imports: [InfoPopover],
  template: `
    @if (_visible()) {
      <section
        class="border-border bg-card flex flex-col gap-3 rounded-xl border p-4"
        data-testid="pro-report-ranking"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-semibold tracking-wide uppercase">Worst lines by reports</h2>
          <app-info-popover
            label="How this is counted"
            [content]="_definition()"
            [link]="_methodologyLink"
            testId="pro-report-ranking-popover"
            triggerClasses="cursor-help"
          >
            <span class="text-muted-foreground text-xs hover:underline">How?</span>
          </app-info-popover>
        </div>

        <p class="text-muted-foreground text-xs">
          Rider reports per line · service day {{ _serviceDayLabel }} · busiest first
        </p>

        <ol class="flex flex-col gap-1.5" data-testid="pro-report-ranking-list">
          @for (row of _rows(); track row.lineId) {
            <li
              class="flex flex-col gap-1"
              data-testid="ranking-row"
              [attr.data-line-id]="row.lineId"
            >
              <div class="flex items-baseline gap-2">
                <span class="text-sm font-medium tabular-nums" data-testid="ranking-row-code">
                  {{ row.code }}
                </span>
                <span
                  class="text-muted-foreground ml-auto text-xs tabular-nums"
                  data-testid="ranking-row-count"
                >
                  {{ reportsPhrase(row.count) }}
                </span>
              </div>
              <!-- The track and fill are one gradient of a single colour: the LENGTH is the whole
                   reading here, and there is no second dimension to encode. aria-hidden because
                   the row's own sentence below already carries the count for a screen reader. -->
              <div class="bg-muted h-1.5 w-full overflow-hidden rounded-full" aria-hidden="true">
                <div
                  class="bg-brand h-full rounded-full"
                  [style.width.%]="row.percent"
                  data-testid="ranking-bar"
                ></div>
              </div>
            </li>
          }
        </ol>
      </section>
    }
  `,
})
export class ProReportRankingComponent {
  private readonly store = inject(HomeStore);

  protected readonly _serviceDayLabel = SERVICE_DAY_LABEL;
  protected readonly reportsPhrase = reportsPhrase;

  protected readonly _rows = computed<RankingRow[]>(() => {
    const ranked = this.store
      .visibleLines()
      .map((line) => ({
        lineId: line.id,
        code: line.code,
        count: historyTotal(this.store.linesHistoryFor(line.id)),
      }))
      // Zero-report lines are dropped rather than ranked: an all-zero network has no worst line, and
      // five empty bars would read as a measurement where there is none.
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
    const top = ranked.slice(0, REPORT_RANKING_TOP_LINES);
    // `top[0]` is the busiest row by construction, so the leader is always 100% — and with `top`
    // empty the map never runs, so there is no division by zero to guard.
    const max = top[0]?.count ?? 0;
    return top.map((row) => ({
      ...row,
      percent: Math.max((row.count / max) * 100, MIN_HISTORY_BAR_PERCENT),
    }));
  });

  /**
   * The widget, or nothing: the per-line history read's OWN failure flag (never
   * `HomeStore.hasError()`), and at least one line someone actually reported about.
   */
  protected readonly _visible = computed(
    () => !this.store.linesHistoryFailed() && this._rows().length > 0,
  );

  /** The rule, from the methodology registry — never a literal in this template. */
  protected readonly _definition = computed(() =>
    renderMethodologyCopy(metricDoc("network.report-ranking").definition),
  );

  /** Deep link into the section that owns the rule. */
  protected readonly _methodologyLink = {
    text: "Read the full method",
    routerLink: "/methodology",
    fragment: "line-status",
  };

  constructor() {
    // The same single per-line read the row strips and the heat grid ask for — this widget is a third
    // VIEW of it, not a read of its own, so this call costs nothing when any of the others is mounted.
    this.store.requestHistoryReads();
  }
}
