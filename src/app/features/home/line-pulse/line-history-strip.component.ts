import { Component, computed, inject, input } from "@angular/core";

import {
  metricDoc,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import { InfoPopover } from "../../../ui/info-popover/info-popover";
import { HomeStore } from "../data/home.store";
import {
  historyBarClass,
  historyBarHeightPct,
  historyBarTitle,
  historySummaryLabel,
  historyTotal,
} from "../data/status-history-display.util";

/** One hour of ONE line's service day, as a cell. */
interface StripCell {
  /** The bucket's `hourStart` — unique per hour, and the `@for` track key. */
  hourStart: string;
  heightPct: number;
  colorClass: string;
  title: string;
}

/**
 * A line's **24-hour mini strip** for the compact board row: one cell per service-day hour, tall by
 * that line's own report count in the hour and coloured by the status that dominated it.
 *
 * This is the PER-LINE counterpart of the hero's network sparkline, and reading the other one would
 * be the bug: `linesStatusHistory` answers for one line, `networkStatusHistory` tallies all of them.
 * Both widgets share `status-history-display.util` for their formatting so the same hour cannot be
 * labelled two ways, and the store's `linesHistoryFor(lineId)` is the per-line lookup this renders.
 *
 * **Hidden entirely when there is nothing to show** — an empty bucket list, or a failed read. Both
 * are quiet: `buckets: []` is the backend's "this line reported nothing this service day" (the same
 * answer the expanded chart draws as its empty state), and the failure is the resource's own flag
 * rather than the page's, so a strip that cannot load never takes the retry banner down with it. A
 * compact row is already dense; 24 empty cells would be noise, and a "no data" chip would be a claim
 * the row has no room to qualify.
 *
 * 🔴 **It is `aria-hidden` with a text alternative on the host.** The cells are individually
 * meaningless ("a coloured rectangle") and a screen-reader user gets nothing from 24 of them, so the
 * whole strip is hidden from the accessibility tree and the host carries one sentence — the same
 * `historySummaryLabel` the sparkline uses, scoped to this line — instead. That sentence is why the
 * strip may be decorative at the cell level and still not be decorative overall.
 *
 * It takes `lineId` as an input (not the whole line) because that is all it reads, and it adds **no
 * request of its own** — `HomeStore`'s single `linesStatusHistory` read serves every row on the page.
 */
@Component({
  selector: "app-line-history-strip",
  imports: [InfoPopover],
  template: `
    @if (_visible()) {
      <div class="flex items-center gap-2" data-testid="row-history-strip">
        <!-- The visible control is the INFO trigger, so the cells themselves stay aria-hidden and a
             screen reader is handed one sentence from the label below rather than 24 rectangles. -->
        <app-info-popover
          label="This line's reports by hour"
          iconPosition="end"
          [content]="_definition()"
          testId="row-history-strip-popover"
          [showMethodologyLink]="false"
          triggerClasses="cursor-help"
        >
          <span class="text-muted-foreground text-[10px] tabular-nums">{{ _total() }}</span>
        </app-info-popover>

        <div class="flex h-4 min-w-0 flex-1 items-end gap-px" aria-hidden="true">
          @for (cell of _cells(); track cell.hourStart) {
            <div
              class="min-w-0 flex-1 rounded-[1px]"
              [class]="cell.colorClass"
              [style.height.%]="cell.heightPct"
              [title]="cell.title"
              data-testid="row-history-cell"
            ></div>
          }
        </div>
      </div>
      <!-- The text alternative. Visually hidden rather than absent, so the sentence is in the DOM
           for assistive technology and in no reader's eye. -->
      <span class="sr-only" [attr.data-testid]="'row-history-label'">{{ _label() }}</span>
    }
  `,
})
export class LineHistoryStripComponent {
  /** The one field this widget reads — deliberately not the whole `LinePulse`. */
  readonly lineId = input.required<string>();

  private readonly store = inject(HomeStore);

  protected readonly _buckets = computed(() => this.store.linesHistoryFor(this.lineId()));

  protected readonly _cells = computed<StripCell[]>(() => {
    const buckets = this._buckets();
    // Scaled to THIS line's busiest hour, never to the network's — a quiet line next to a busy one
    // has to look quiet, or the row is lying about the line the reader is looking at.
    const max = buckets.reduce((highest, bucket) => Math.max(highest, bucket.count), 0);
    return buckets.map((bucket) => ({
      hourStart: bucket.hourStart,
      heightPct: historyBarHeightPct(bucket.count, max),
      colorClass: historyBarClass(bucket),
      title: historyBarTitle(bucket),
    }));
  });

  protected readonly _total = computed(() => historyTotal(this._buckets()));

  /**
   * The whole strip, or nothing.
   *
   * Two hidden states, both quiet and both correct: the read failed (its OWN flag, never the page's
   * `hasError` — a broken strip must not take the retry banner down with it) and the backend's empty
   * answer, which is this line reporting nothing during the service day rather than an error. The
   * compact row is already dense; a "no data" chip would be a claim it has no room to qualify.
   */
  protected readonly _visible = computed(
    () => !this.store.linesHistoryFailed() && this._cells().length > 0,
  );

  /** The per-line sentence — same shape as the network one, scoped to this line. */
  protected readonly _label = computed(() =>
    historySummaryLabel(this._buckets(), `Rider reports for this line in this service day`),
  );

  /** The definition, from the registry rather than a literal in this template. */
  protected readonly _definition = computed(() =>
    renderMethodologyCopy(metricDoc("network.line-history-strip").definition),
  );

  constructor() {
    // Opts the store's single per-line read in. Sixteen rows mount this widget and it is still ONE
    // request: the store owns the resource, this call only opens the gate (`requestHistoryReads`).
    this.store.requestHistoryReads();
  }
}
