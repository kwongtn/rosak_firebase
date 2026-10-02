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
 * was busy". Per-line readings come from `linesStatusHistory` behind the board's strips instead —
 * drawing the aggregate under a single line's name would silently attribute other lines' reports to
 * it, which is the one thing a status widget must never do.
 *
 * It reads `HomeStore.networkHistory()` and adds **no request of its own** — the store owns the lazy
 * read, exactly as it owns the feed's windows.
 *
 * 🔴 **It hides entirely on a failed read.** `networkHistoryFailed` is the widget's OWN error signal,
 * never `HomeStore.hasError()`: a sparkline is a supporting widget, and a supporting widget that
 * cannot load must not replace a working page of statuses with the page-level retry banner. The
 * same reason the empty case hides it — `[]` is the backend's "nothing reported this service day",
 * not an error and not a zero-valued bar chart.
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
    @if (_visible()) {
      <figure class="flex flex-col gap-1" data-testid="network-sparkline">
        <figcaption class="text-muted-foreground flex items-center justify-between gap-2 text-xs">
          <app-info-popover
            label="Network activity by hour"
            [content]="_definition()"
            [link]="_methodologyLink"
            testId="network-sparkline-popover"
            triggerClasses="cursor-help"
          >
            <span class="hover:underline"
              >Network activity · service day {{ _serviceDayLabel }}</span
            >
          </app-info-popover>
          <span class="tabular-nums">{{ _total() }} reports</span>
        </figcaption>

        <!-- One role="img" with a sentence, not 24 focusable or announced bars. Each bar keeps its
             own hour detail in its title attribute, which is where a pointer user looks. -->
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

        <!-- Only the two endpoints. A 24-label axis at this size is unreadable and would make the
             sparkline the loudest thing in the hero; the per-hour names live in the tooltips and in
             the accessible sentence. -->
        <div
          class="text-muted-foreground flex justify-between text-[10px] tabular-nums"
          aria-hidden="true"
        >
          <span>{{ _firstHour() }}</span>
          <span>{{ _lastHour() }}</span>
        </div>
      </figure>
    }
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
   * The whole widget, or nothing.
   *
   * Two hidden states, both quiet and both correct: a failed read (its own flag, never the page's)
   * and the backend's empty answer. Nothing is rendered as an error message, because a hero is not
   * where a chart reports a failure — the reader has work to do here and the board below still works.
   */
  protected readonly _visible = computed(
    () => !this.store.networkHistoryFailed() && this._bars().length > 0,
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
