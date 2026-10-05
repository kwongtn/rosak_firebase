import { Component, computed, inject } from "@angular/core";

import {
  metricDoc,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import { InfoPopover, type InfoPopoverLink } from "../../../ui/info-popover/info-popover";
import { HomeStore } from "../data/home.store";
import {
  SERVICE_DAY_LABEL,
  historyBarClass,
  historyBarHeightPct,
  historyBarTitle,
  historySummaryLabel,
  historyTotal,
  serviceHourLabel,
} from "../data/status-history-display.util";

/**
 * One hour of the network's service day, as a bar.
 *
 * Only what the template draws: the hour's name for the `data-hour` hook, its scaled height, its
 * colour, and the tooltip that carries the hour's detail. The per-hour TALLY is deliberately not
 * here — a sparkline's job is the shape of the day, and a number on every one of 24 bars is the
 * thing that turns a sparkline into a chart.
 */
interface SparkBar {
  /** The bucket's `hourStart` — unique per hour, and the `@for` track key. */
  hourStart: string;
  hourLabel: string;
  heightPct: number;
  colorClass: string;
  title: string;
}

/**
 * The hero's **network activity sparkline**: 24 bars, one per hour of the community service day,
 * tall by how many rider reports the WHOLE network received in that hour and coloured by the status
 * that dominated it.
 *
 * 🔴 **This is a NETWORK aggregate, and the label says so.** `networkStatusHistory` tallies every
 * line's reports into each hour, so a tall amber bar means "the network was busy", never "this line
 * was busy". Per-line readings come from `linesStatusHistory` behind the board rows' report labels
 * instead — drawing the aggregate under a single line's name would silently attribute other lines'
 * reports to it, which is the one thing a status widget must never do.
 *
 * It reads `HomeStore.networkHistory()` and adds **no request of its own** — the store owns the lazy
 * read, exactly as it owns the feed's windows.
 *
 * 🔴 **It always holds its space.** `networkHistoryFailed` is the widget's OWN error signal, never
 * `HomeStore.hasError()`: a sparkline is a supporting widget, and a supporting widget that cannot
 * load must not replace a working page of statuses with the page-level retry banner. So a failed or
 * empty read renders a dashed placeholder of the CHART's own height rather than vanishing — a hero
 * that grows a hole in itself when the slowest read lands is worse than one that says nothing was
 * reported. The two quiet states still read differently ("Activity data unavailable" vs "No
 * activity reported yet"), because only one of them is a failure the reader may hit again.
 *
 * Accessibility: the bar row is a single `role="img"` with a sentence that carries the same four
 * facts a sighted reader takes from the bars and the tooltips (what, which window, how much, and when
 * the peak was). The individual bars are `aria-hidden` and keep their per-hour detail in `title`, so a
 * screen reader is handed one summary instead of twenty-four disconnected hour numbers. The
 * definition itself comes from the methodology registry through `InfoPopover`, never a literal.
 */
@Component({
  selector: "app-network-sparkline",
  imports: [InfoPopover],
  template: `
    <figure class="flex flex-col gap-1" data-testid="network-sparkline">
      <figcaption class="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        <app-info-popover
          label="Network activity by hour"
          [content]="_definition()"
          [link]="_methodologyLink"
          testId="network-sparkline-popover"
          iconPosition="end"
          triggerClasses="cursor-help"
        >
          <span class="hover:underline">Network activity · service day {{ _serviceDayLabel }}</span>
        </app-info-popover>
        <span class="tabular-nums">{{ _total() }} reports</span>
      </figcaption>

      <!-- One role="img" with a sentence, not 24 focusable or announced bars. Each bar keeps its
           own hour detail in its title attribute, which is where a pointer user looks. -->
      @if (_plotted()) {
        <div
          class="flex h-10 items-end gap-px"
          role="img"
          [attr.aria-label]="_label()"
          data-testid="network-sparkline-bars"
        >
          @for (bar of _bars(); track bar.hourStart) {
            <div
              class="min-w-0 flex-1 rounded-[1px]"
              [class]="bar.colorClass"
              [style.height.%]="bar.heightPct"
              [title]="bar.title"
              aria-hidden="true"
              data-testid="sparkline-bar"
              [attr.data-hour]="bar.hourLabel"
            ></div>
          }
        </div>
      } @else {
        <!-- 🔴 Same h-10 as the bar row, so an empty or failed read costs the hero no height and the
             page does not jump under the reader. Dashed rather than filled: there is nothing to plot
             yet, and a flat baseline would read as twenty-four quiet hours. -->
        <div
          class="border-border text-muted-foreground flex h-10 items-center justify-center rounded-md border border-dashed text-[10px]"
          data-testid="network-sparkline-empty"
        >
          {{ _emptyCopy() }}
        </div>
      }

      <!-- Only the two endpoints. A 24-label axis at this size is unreadable and would make the
           sparkline the loudest thing in the hero; the per-hour names live in the tooltips and in
           the accessible sentence. Always rendered (empty strings and all) so the widget's total
           height is stable across all three states. -->
      <div
        class="text-muted-foreground flex justify-between text-[10px] tabular-nums"
        aria-hidden="true"
      >
        <span>{{ _firstHour() }}</span>
        <span>{{ _lastHour() }}</span>
      </div>
    </figure>
  `,
})
export class NetworkSparklineComponent {
  private readonly store = inject(HomeStore);

  protected readonly _serviceDayLabel = SERVICE_DAY_LABEL;

  /** The 24 buckets, tallest hour scaled to full height, each already carrying its own tooltip. */
  protected readonly _bars = computed<SparkBar[]>(() => {
    const buckets = this.store.networkHistory();
    const max = buckets.reduce((highest, bucket) => Math.max(highest, bucket.count), 0);
    return buckets.map((bucket) => ({
      hourStart: bucket.hourStart,
      hourLabel: serviceHourLabel(bucket.hourStart),
      heightPct: historyBarHeightPct(bucket.count, max),
      colorClass: historyBarClass(bucket),
      title: historyBarTitle(bucket),
    }));
  });

  protected readonly _total = computed(() => historyTotal(this.store.networkHistory()));

  /**
   * Whether there is anything real to plot — the ONE branch decision, so the bars and the
   * placeholder can never both be absent or both present.
   *
   * 🔴 The failed read is excluded even though the store still holds the last answer: those bars
   * would be yesterday's picture drawn as today's, which is worse than an honest empty box. This is
   * the old `_visible()` predicate, kept verbatim — what changed is only that its false branch now
   * renders a placeholder instead of nothing.
   */
  protected readonly _plotted = computed(
    () => !this.store.networkHistoryFailed() && this._bars().length > 0,
  );

  /**
   * Which of the two QUIET states this is, in words. They read differently on purpose: `[]` is the
   * backend's documented "nothing reported in this service day", while a failure is a read the
   * reader may see succeed on the next poll.
   */
  protected readonly _emptyCopy = computed(() =>
    this.store.networkHistoryFailed() ? "Activity data unavailable" : "No activity reported yet",
  );

  /** The accessible sentence — see `historySummaryLabel` for why it has that shape. */
  protected readonly _label = computed(() =>
    historySummaryLabel(
      this.store.networkHistory(),
      "Rider reports across every line on the network",
    ),
  );

  /** The definition, from the registry: the hero must not carry its own copy of the rule. */
  protected readonly _definition = computed(() =>
    renderMethodologyCopy(metricDoc("network.activity-sparkline").definition),
  );

  protected readonly _methodologyLink: InfoPopoverLink = {
    text: "How this is counted",
    routerLink: "/methodology",
    fragment: "line-status",
  };

  /** The first and last hour the strip spans, so the axis names the window it covers. */
  protected readonly _firstHour = computed(() => this._bars()[0]?.hourLabel ?? "");

  protected readonly _lastHour = computed(() => {
    const bars = this._bars();
    return bars.length === 0 ? "" : (bars[bars.length - 1]?.hourLabel ?? "");
  });

  constructor() {
    // The store holds the read but does not ask for it on its own — this widget is the surface that
    // renders the answer, so it is the one that opts in (see `HomeStore.requestHistoryReads`).
    this.store.requestHistoryReads();
  }
}
